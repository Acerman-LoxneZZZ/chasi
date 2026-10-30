import { test, expect, type Page } from '@playwright/test'

const canvas = (page: Page) => page.locator('canvas.watch-canvas')
const slider = (page: Page) => page.getByRole('slider', { name: 'Разборка часов', exact: true })
const tools = (page: Page) => page.locator('details.exhibit-tools')
const progress = async (page: Page) => Number(await canvas(page).getAttribute('data-progress'))

// Compare camera poses only after a model frame has painted the canonical value.
const settled = async (page: Page) => {
  await expect.poll(async () => canvas(page).evaluate(el => {
    const canonical = Number(el.dataset.progress)
    const rendered = Number(el.dataset.renderedProgress)
    return Number.isFinite(canonical) && Number.isFinite(rendered) && Math.abs(rendered - canonical) < .00001
  }), { timeout: 30000 }).toBe(true)
}
const painted = async (page: Page) => {
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'ready', { timeout: 60000 })
  await expect.poll(async () => canvas(page).evaluate(el => {
    const b = JSON.parse(el.dataset.bounds || '{}') as Record<string, unknown>
    return Number(el.dataset.drawCalls) > 0 && Number(el.dataset.triangles) > 0
      && ['minX', 'minY', 'maxX', 'maxY', 'width', 'height'].every(key => typeof b[key] === 'number' && Number.isFinite(b[key]))
      && Number(b.maxX) > Number(b.minX) && Number(b.maxY) > Number(b.minY)
      && Number(b.width) > 0 && Number(b.height) > 0
  }), { timeout: 60000 }).toBe(true)
  await page.evaluate(() => document.fonts.ready)
  await settled(page)
}
const ready = async (page: Page) => {
  await page.goto('/')
  await painted(page)
}
const openTools = async (page: Page) => {
  if (!await tools(page).evaluate((el: HTMLDetailsElement) => el.open)) await tools(page).locator('summary').click()
  await expect(slider(page)).toBeVisible()
}
const scrollToProgress = async (page: Page, p: number) => {
  await page.evaluate(value => {
    const section = document.querySelector<HTMLElement>('.watch-story')!
    window.scrollTo({ top: Number(section.dataset.storyStart) + Number(section.dataset.storyTravel) * value, behavior: 'instant' })
  }, p)
  await expect.poll(async () => Math.abs(await progress(page) - p)).toBeLessThan(.0006)
  await settled(page)
}
const setManualProgress = async (page: Page, percent: number) => {
  await openTools(page)
  await slider(page).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, percent)
  await expect.poll(async () => Math.abs(await progress(page) - percent / 100)).toBeLessThan(.0006)
  await settled(page)
}
const camera = async (page: Page) => {
  await settled(page)
  return JSON.parse((await canvas(page).getAttribute('data-camera'))!) as { position: number[]; quaternion: number[]; target: number[] }
}
const assertBounds = async (page: Page) => {
  await expect.poll(async () => canvas(page).evaluate(el => {
    const b = JSON.parse(el.dataset.bounds || '{}')
    return b.width === el.clientWidth && b.height === el.clientHeight
  })).toBe(true)
  const result = await canvas(page).evaluate(el => ({
    b: JSON.parse(el.dataset.bounds!), viewport: [innerWidth, innerHeight],
    rect: el.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }))
  expect(result.overflow).toBe(false)
  expect(result.b.minX).toBeGreaterThanOrEqual(0)
  expect(result.b.minY).toBeGreaterThanOrEqual(0)
  expect(result.b.maxX).toBeLessThanOrEqual(result.b.width)
  expect(result.b.maxY).toBeLessThanOrEqual(result.b.height)
  return result
}

test('the default page contains only a large fullscreen watch with closed tools at all required sizes', async ({ page }) => {
  test.setTimeout(240000)
  await ready(page)
  await expect(page.locator('html')).toHaveClass(/\blenis\b/)
  await expect(page.locator('.watch-story')).toHaveAttribute('data-scroll-engine', 'gsap-lenis')
  await expect(page.locator('main > section')).toHaveCount(1)
  await expect(page.locator('#anatomy, #about, .inside-section, .site-footer')).toHaveCount(0)
  await expect(page.locator('.detail-dialog')).not.toBeVisible()
  await expect(slider(page)).not.toBeVisible()
  await expect(page.locator('.part-label:not([hidden])')).toHaveCount(0)
  for (const [width, height] of [[1440, 1000], [1280, 800], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height })
    await scrollToProgress(page, 0)
    const result = await assertBounds(page)
    expect(result.rect.width).toBe(width)
    expect(result.rect.height).toBe(height)
    const fill = width < 700 ? (result.b.maxX - result.b.minX) / width : (result.b.maxY - result.b.minY) / height
    expect(fill).toBeGreaterThan(.7)
    for (const p of [.5, 1]) {
      await scrollToProgress(page, p)
      await assertBounds(page)
    }
  }
})

test('scroll makes a complete orbit and a focused macro dolly, reverses exactly and stops rendering when idle', async ({ page }) => {
  const errors: string[] = [], failedResources: string[] = []
  let modelRequests = 0
  page.on('pageerror', error => errors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) failedResources.push(response.url()) })
  page.on('request', request => { if (request.url().includes('/models/pocket-watch.glb')) modelRequests++ })
  await ready(page)
  const initial = await camera(page)
  let previous = 0, turn = 0
  for (const [index, p] of [0, .2, .4, .6, .8, 1].entries()) {
    await scrollToProgress(page, p)
    const [x, y, z, w] = (await camera(page)).quaternion
    const angle = Math.atan2(2 * (x * z + w * y), 1 - 2 * (x * x + y * y))
    if (index) turn += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous))
    previous = angle
  }
  expect(turn * 180 / Math.PI).toBeGreaterThan(360)
  expect(turn * 180 / Math.PI).toBeLessThan(500)
  const overview = await camera(page)
  const distance = (pose: typeof overview) => Math.hypot(...pose.position.map((value, index) => value - pose.target[index]))
  await scrollToProgress(page, .75)
  const macro = await canvas(page).evaluate(element => ({
    weight: Number(element.dataset.macro), focus: JSON.parse(element.dataset.focus || 'null') as number[] | null,
    bounds: JSON.parse(element.dataset.bounds || '{}') as Record<string, number>,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }))
  expect(macro.weight).toBeCloseTo(1, 4)
  expect(macro.focus).toHaveLength(3)
  expect(macro.focus!.every(Number.isFinite)).toBe(true)
  expect(Math.abs(macro.focus![0])).toBeLessThan(.01)
  expect(Math.abs(macro.focus![1])).toBeLessThan(.01)
  expect(macro.focus![2]).toBeGreaterThan(-1)
  expect(macro.focus![2]).toBeLessThan(1)
  expect(Object.values(macro.bounds).every(Number.isFinite)).toBe(true)
  expect(macro.bounds.minX < 0 || macro.bounds.minY < 0 || macro.bounds.maxX > macro.bounds.width || macro.bounds.maxY > macro.bounds.height).toBe(true)
  expect(distance(await camera(page))).toBeLessThan(distance(overview) * .6)
  expect(macro.overflow).toBe(false)
  await scrollToProgress(page, 0)
  await expect(canvas(page)).toHaveAttribute('data-macro', '0.00000')
  expect(await camera(page)).toEqual(initial)
  await expect.poll(async () => {
    const before = await canvas(page).getAttribute('data-frames')
    await page.waitForTimeout(200)
    return await canvas(page).getAttribute('data-frames') === before
  }).toBe(true)
  const stopped = await canvas(page).getAttribute('data-frames')
  await page.waitForTimeout(300)
  expect(await canvas(page).getAttribute('data-frames')).toBe(stopped)
  expect(modelRequests).toBe(1)
  expect(errors).toEqual([])
  expect(failedResources).toEqual([])
})

test('the control popover supports native range keys, exact endpoints, pause and interruption', async ({ page }) => {
  await ready(page)
  await openTools(page)
  await expect(slider(page)).toBeEnabled()
  await slider(page).press('End')
  await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000')
  await slider(page).press('Home')
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  await slider(page).press('ArrowRight')
  expect(await progress(page)).toBeGreaterThan(0)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /Разобрано/)
  await slider(page).press('Home')
  await page.getByRole('button', { name: 'Разобрать', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  const pause = page.getByRole('button', { name: 'Пауза', exact: true })
  await pause.focus()
  await page.keyboard.press('Space')
  await expect(pause).toHaveCount(0)
  const paused = await progress(page)
  await settled(page)
  await page.waitForTimeout(200)
  expect(await progress(page)).toBe(paused)
  // Dispatch through the real DOM listener before SwiftShader can consume the
  // passage in CDP's wheel delivery wait. Native wheel scrolling is checked below.
  await page.getByRole('button', { name: 'Разобрать', exact: true }).evaluate(button => {
    ;(button as HTMLButtonElement).click()
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 40, bubbles: true }))
  })
  await expect(pause).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(tools(page)).not.toHaveAttribute('open', '')
  await expect(tools(page).locator('summary')).toBeFocused()
})

test('manual orbit and slider ignore document scroll, then resume and reload keep the current pose', async ({ page }) => {
  test.setTimeout(240000)
  await ready(page)
  await scrollToProgress(page, .4)
  const initial = await camera(page)
  await page.getByRole('button', { name: 'Рассмотреть', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  expect(await camera(page)).toEqual(initial)
  const bounds = await canvas(page).boundingBox()
  await page.mouse.move(bounds!.width * .5, bounds!.height * .5)
  await page.mouse.down()
  await page.mouse.move(bounds!.width * .65, bounds!.height * .53, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => JSON.stringify((await camera(page)).quaternion)).not.toBe(JSON.stringify(initial.quaternion))
  const frozen = await progress(page)
  await page.evaluate(() => window.scrollBy({ top: 250, behavior: 'instant' }))
  await page.waitForTimeout(150)
  expect(await progress(page)).toBe(frozen)
  const y = await page.evaluate(() => scrollY)
  await setManualProgress(page, 64)
  expect(await page.evaluate(() => scrollY)).toBe(y)
  await page.getByRole('button', { name: 'Сбросить вид', exact: true }).click()
  expect(await progress(page)).toBe(.64)
  await page.getByRole('button', { name: 'Продолжить историю', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await expect.poll(() => page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('.watch-story')!
    return Math.abs(scrollY - Number(section.dataset.storyStart) - .64 * Number(section.dataset.storyTravel))
  })).toBeLessThanOrEqual(1)
  await settled(page)
  await page.reload()
  await painted(page)
  await expect.poll(async () => Math.abs(await progress(page) - .64)).toBeLessThan(.001)
  await settled(page)
})

test('the native details drawer contains all 47 selectable groups, traps focus and closes with Escape', async ({ page }) => {
  await ready(page)
  const opener = page.getByRole('button', { name: 'Детали часов', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Устройство часов', exact: true })
  await opener.click()
  await expect(dialog).toBeVisible()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await dialog.getByRole('button', { name: 'Циферблат', exact: true }).click()
  await expect(dialog.locator('.part-info h3')).toHaveText('Циферблат')
  await dialog.locator('.all-parts > summary').click()
  expect(await dialog.locator('.part-catalog button').count()).toBe(47)
  await dialog.getByRole('button', { name: 'Накладной камень баланса', exact: true }).click()
  await expect(dialog.locator('.part-info h3')).toHaveText('Накладной камень баланса')
  await dialog.getByRole('button', { name: 'Снять выделение детали', exact: true }).click()
  await expect(dialog.locator('.part-info h3')).toHaveText('У каждой детали — своя роль')
  await page.keyboard.press('Tab')
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(opener).toBeFocused()
  await expect(tools(page)).not.toHaveAttribute('open', '')
  const bounds = await canvas(page).boundingBox()
  await canvas(page).click({ position: { x: bounds!.width / 2, y: bounds!.height * .61 } })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('.part-info--selected')).toHaveCount(1)
})

test('reduced motion stays compact and direct, including when the preference changes at runtime', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  const section = await page.locator('.watch-story').boundingBox()
  expect(section!.height).toBeLessThanOrEqual(1001)
  await openTools(page)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000', { timeout: 1000 })
  await settled(page)
  await page.getByRole('button', { name: 'Собрать', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000', { timeout: 1000 })
  await page.getByRole('button', { name: 'Продолжить историю', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await scrollToProgress(page, 0)
  const orientation = (await camera(page)).quaternion
  await scrollToProgress(page, 1)
  expect((await camera(page)).quaternion).toEqual(orientation)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await scrollToProgress(page, .4)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  expect(await progress(page)).toBeCloseTo(.4, 3)
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
})

test('a failed GLB request keeps a working retry and compact fallback', async ({ page }) => {
  let requests = 0
  await page.route('**/models/pocket-watch.glb', async route => {
    requests++
    if (requests === 1) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Controlled failure' })
    else await route.continue()
  })
  await page.goto('/')
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'error')
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
  await expect(page.getByRole('button', { name: 'Детали часов', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click()
  await painted(page)
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  expect(requests).toBe(2)
})

test('WebGL loss restores the same configuration and unavailable WebGL shows a real fallback', async ({ page }) => {
  await ready(page)
  await scrollToProgress(page, .5)
  const supported = await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { __restoreWatch: () => void }).__restoreWatch = () => extension.restoreContext()
    extension.loseContext()
    return true
  })
  expect(supported).toBe(true)
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'context-lost')
  await page.evaluate(() => (window as unknown as { __restoreWatch: () => void }).__restoreWatch())
  await painted(page)
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.50000')
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await settled(page)
  const fallbackPage = await page.context().newPage()
  try {
    await fallbackPage.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (/^(webgl2?|experimental-webgl)$/.test(type)) return null
        return Reflect.apply(original, this, [type, ...args])
      } })
    })
    await fallbackPage.goto('/')
    await expect(fallbackPage.locator('.experience')).toHaveAttribute('data-status', 'unsupported')
    await expect(fallbackPage.locator('.watch-fallback')).toBeVisible()
    await expect.poll(() => fallbackPage.locator('.watch-fallback').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
    await expect(fallbackPage.locator('.mode-button')).toBeDisabled()
    await openTools(fallbackPage)
    await expect(slider(fallbackPage)).toBeDisabled()
  } finally { await fallbackPage.close() }
})

test('the controls remain usable at 200% layout density with keyboard focus and 44px targets', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Рассмотреть', exact: true }).click()
  const cdp = await page.context().newCDPSession(page)
  // Layout-density emulation, not a claim about native browser zoom controls.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 500, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 1000 })
  await openTools(page)
  await slider(page).focus()
  const metrics = await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>('#explosion-range')!
    return {
      width: document.documentElement.scrollWidth, range: input.getBoundingClientRect().toJSON(), outline: getComputedStyle(input).outlineStyle,
      targets: [...document.querySelectorAll<HTMLElement>('.site-header button,.exhibit-tools > summary,.controls-popover button,.labels-toggle,input[type="range"]')].map(element => element.getBoundingClientRect().height),
    }
  })
  expect(metrics.width).toBeLessThanOrEqual(721)
  expect(metrics.range.width).toBeGreaterThan(200)
  expect(metrics.range.left).toBeGreaterThanOrEqual(0)
  expect(metrics.range.right).toBeLessThanOrEqual(720)
  expect(metrics.outline).not.toBe('none')
  expect(metrics.targets.every(height => height >= 44)).toBe(true)
  await slider(page).press('End')
  await expect(slider(page)).toHaveValue('100')
  await slider(page).press('Home')
  await expect(slider(page)).toHaveValue('0')
})

test.describe('mobile fullscreen interaction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test('native swipes scroll only in story mode, and optional labels do not cover the model', async ({ page }) => {
    await ready(page)
    const cdp = await page.context().newCDPSession(page)
    const swipe = async () => {
      const bounds = await canvas(page).boundingBox()
      const x = bounds!.x + bounds!.width * .5, from = bounds!.y + bounds!.height * .7, to = bounds!.y + bounds!.height * .32
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] })
      for (let index = 1; index <= 6; index++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * index / 6 }] })
        await page.waitForTimeout(25)
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    }
    expect(await canvas(page).evaluate(element => getComputedStyle(element).touchAction)).toBe('pan-y')
    await swipe()
    await expect.poll(() => progress(page)).toBeGreaterThan(.01)
    await scrollToProgress(page, .4)
    await page.getByRole('button', { name: 'Рассмотреть', exact: true }).tap()
    const frozen = await progress(page), y = await page.evaluate(() => scrollY), initial = await camera(page)
    expect(await canvas(page).evaluate(element => getComputedStyle(element).touchAction)).toBe('none')
    await swipe()
    await expect.poll(async () => JSON.stringify((await camera(page)).quaternion)).not.toBe(JSON.stringify(initial.quaternion))
    expect(await progress(page)).toBe(frozen)
    expect(await page.evaluate(() => scrollY)).toBe(y)
    await openTools(page)
    const toggle = page.getByRole('checkbox', { name: 'Подписи деталей', exact: true })
    await expect(toggle).not.toBeChecked()
    await toggle.check()
    await expect(toggle).toBeChecked()
    await page.getByRole('button', { name: 'Закрыть управление', exact: true }).tap()
    await assertBounds(page)
    const labels = page.locator('.part-label:not([hidden])')
    expect(await labels.count()).toBeLessThanOrEqual(1)
    for (const label of await labels.all()) {
      const labelBox = await label.boundingBox(), modelBox = await canvas(page).boundingBox()
      expect(labelBox!.y).toBeGreaterThanOrEqual(modelBox!.y + modelBox!.height)
      expect(labelBox!.x).toBeGreaterThanOrEqual(0)
      expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(390)
    }
    await page.getByRole('button', { name: 'Продолжить историю', exact: true }).tap()
    await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
    await settled(page)
    await openTools(page)
    await toggle.uncheck()
    await expect(page.locator('.part-label:not([hidden])')).toHaveCount(0)
  })
})
