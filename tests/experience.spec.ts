import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const slider = (page: Page) => page.getByRole('slider', { name: 'Разборка часов', exact: true })
const canvas = (page: Page) => page.locator('canvas')
const progress = async (page: Page) => Number(await canvas(page).getAttribute('data-progress'))
const ready = async (page: Page) => {
  await page.goto('/')
  await expect(slider(page)).toBeEnabled({ timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
}
const setProgress = async (page: Page, percent: number) => {
  await slider(page).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(value))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, percent)
  // Story scroll has the browser's one-CSS-pixel quantization; manual progress is exact.
  await expect.poll(async () => Math.abs(await progress(page) - percent / 100)).toBeLessThan(.0006)
}
const scrollProgress = async (page: Page, value: number) => {
  await page.evaluate(p => {
    const section = document.querySelector<HTMLElement>('.watch-story')!
    window.scrollTo({ top: Number(section.dataset.storyStart) + p * Number(section.dataset.storyTravel), behavior: 'instant' })
  }, value)
  await expect.poll(async () => Math.abs(await progress(page) - value)).toBeLessThan(.0006)
}
const inspect = async (page: Page) => {
  await page.getByRole('button', { name: 'Рассмотреть', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
}
const camera = async (page: Page) => {
  const p = await canvas(page).getAttribute('data-progress')
  await expect(canvas(page)).toHaveAttribute('data-rendered-progress', p!)
  return JSON.parse((await canvas(page).getAttribute('data-camera'))!)
}

test('native range, exact endpoints, reverse poses, scroll mapping and a single GLB request', async ({ page }) => {
  const errors: string[] = [], failed: string[] = []
  let requests = 0
  page.on('pageerror', e => errors.push(e.message))
  page.on('response', r => { if (r.status() >= 400) failed.push(r.url()) })
  page.on('request', r => { if (r.url().includes('/models/pocket-watch.glb')) requests++ })
  await ready(page)
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await expect(slider(page)).toHaveAttribute('min', '0')
  await expect(slider(page)).toHaveAttribute('max', '100')
  await slider(page).press('End')
  await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000')
  await slider(page).press('Home')
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  await slider(page).press('ArrowRight')
  expect(await progress(page)).toBeGreaterThan(0)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /Разобрано/)
  await setProgress(page, 37)
  const middle = await camera(page)
  for (const p of [25, 50, 75, 100, 1, 99, 13.7, 0, 37]) await setProgress(page, p)
  expect(await camera(page)).toEqual(middle)
  const mapping = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('.watch-story')!
    return { y: scrollY, start: Number(s.dataset.storyStart), travel: Number(s.dataset.storyTravel) }
  })
  expect(Math.abs(mapping.y - mapping.start - mapping.travel * .37)).toBeLessThanOrEqual(1)
  expect(requests).toBe(1)
  expect(errors).toEqual([])
  expect(failed).toEqual([])
})

test('slow and fast native scrolling, stop, reverse and on-demand idle rendering', async ({ page }) => {
  await ready(page)
  const assembled = await camera(page)
  const rect = await canvas(page).boundingBox()
  await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2)
  for (const delta of [40, 60, 120, 180]) await page.mouse.wheel(0, delta)
  await expect.poll(() => progress(page)).toBeGreaterThan(.03)
  await page.mouse.wheel(0, 1800)
  await expect.poll(() => progress(page)).toBeGreaterThan(.3)
  await page.waitForTimeout(250)
  const stopped = await progress(page), pose = await camera(page)
  const frames = await canvas(page).getAttribute('data-frames')
  await page.waitForTimeout(400)
  expect(await progress(page)).toBe(stopped)
  expect(await camera(page)).toEqual(pose)
  expect(await canvas(page).getAttribute('data-frames')).toBe(frames)
  await scrollProgress(page, 0)
  expect(await camera(page)).toEqual(assembled)
})

test('story buttons move document, pause, reverse and yield to wheel and keyboard', async ({ page }) => {
  await ready(page)
  const button = await page.getByRole('button', { name: 'Разобрать', exact: true }).boundingBox()
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect.poll(() => progress(page)).toBeGreaterThan(.02)
  // The fixed control does not move. Send a native pointer click immediately;
  // waiting for actionability across animation frames can outlast the passage
  // on SwiftShader and leave the locator holding the disabled endpoint button.
  await page.mouse.click(button!.x + button!.width / 2, button!.y + button!.height / 2)
  const paused = await progress(page), y = await page.evaluate(() => scrollY)
  await page.waitForTimeout(350)
  expect(await progress(page)).toBe(paused)
  expect(await page.evaluate(() => scrollY)).toBe(y)
  await setProgress(page, 20)
  // SwiftShader can delay CDP wheel delivery by a complete 6.5s passage. Check
  // cancellation through the real DOM wheel listener synchronously, then use
  // native wheel input to prove the document remains under manual control.
  await page.getByRole('button', { name: 'Разобрать', exact: true }).evaluate(button => {
    ;(button as HTMLButtonElement).click()
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true }))
  })
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
  await page.mouse.wheel(0, 80)
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
  expect(await progress(page)).toBeLessThan(.8)
  await setProgress(page, 20)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  await page.keyboard.press('PageDown')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
  expect(await progress(page)).toBeLessThan(.9)
  await setProgress(page, 52.3)
  await page.getByRole('button', { name: 'Собрать', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000', { timeout: 20000 })
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000', { timeout: 25000 })
})

test('Space on Pause stops without restarting, and Tab interrupts a story transition', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect.poll(() => progress(page)).toBeGreaterThan(.015)
  const pause = page.getByRole('button', { name: 'Пауза', exact: true })
  await pause.focus()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
  const frozen = await progress(page)
  await page.waitForTimeout(400)
  expect(await progress(page)).toBe(frozen)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Пауза', exact: true })).toHaveCount(0)
})

test('manual mode preserves pose and camera, allows orbit and resumes at current manual progress', async ({ page }) => {
  await ready(page)
  await setProgress(page, 50)
  const initial = await camera(page)
  await inspect(page)
  expect(await progress(page)).toBe(.5)
  expect(await camera(page)).toEqual(initial)
  const box = await canvas(page).boundingBox()
  await page.mouse.move(box!.x + box!.width * .5, box!.y + box!.height * .5)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * .66, box!.y + box!.height * .54, { steps: 10 })
  await page.mouse.up()
  expect((await camera(page)).quaternion).not.toEqual(initial.quaternion)
  await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'instant' }))
  await page.waitForTimeout(100)
  expect(await progress(page)).toBe(.5)
  const documentY = await page.evaluate(() => scrollY)
  await setProgress(page, 64)
  expect(await page.evaluate(() => scrollY)).toBe(documentY)
  await page.getByRole('button', { name: 'Сбросить вид', exact: true }).click()
  expect(await progress(page)).toBe(.64)
  await page.getByRole('button', { name: 'Продолжить историю', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await expect.poll(async () => Math.abs(await progress(page) - .64)).toBeLessThan(.0006)
  const expected = await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>('.watch-story')!
    return Number(s.dataset.storyStart) + .64 * Number(s.dataset.storyTravel)
  })
  expect(Math.abs(await page.evaluate(() => scrollY) - expected)).toBeLessThanOrEqual(1)
  await page.waitForTimeout(500)
  await scrollProgress(page, .4)
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.40000')
})

test('HTML labels follow visible nodes, stay outside the model, and selection includes all 47 groups', async ({ page }) => {
  await ready(page)
  expect(await page.locator('.part-label:not([hidden])').count()).toBe(0)
  await setProgress(page, 25)
  await expect.poll(() => page.locator('.part-label:not([hidden])').count()).toBeGreaterThan(0)
  const placement = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas')!, r = c.getBoundingClientRect()
    const bounds = JSON.parse(c.dataset.bounds!)
    return [...document.querySelectorAll<HTMLElement>('.part-label:not([hidden])')].map(l => {
      const b = l.getBoundingClientRect()
      return { node: l.dataset.node, title: l.querySelector('strong')!.textContent, description: l.querySelector('span')!.textContent, clear: b.right <= r.left + bounds.minX || b.left >= r.left + bounds.maxX }
    })
  })
  expect(placement.length).toBeLessThanOrEqual(2)
  expect(placement.every(l => l.clear && l.title && l.description)).toBe(true)
  const toggle = page.getByRole('checkbox', { name: 'Подписи деталей', exact: true })
  await toggle.click(); await expect(page.locator('.part-label:not([hidden])')).toHaveCount(0)
  await toggle.click()
  await inspect(page)
  await page.getByRole('button', { name: /^Циферблат/ }).click()
  const info = page.locator('.anatomy-layout .part-info')
  await expect(info.locator('h3')).toHaveText('Циферблат')
  await expect(info.locator('p')).not.toBeEmpty()
  await page.locator('.all-parts summary').click()
  expect(await page.locator('.part-catalog button').count()).toBe(47)
  await page.getByRole('button', { name: /^Накладной камень баланса/ }).click()
  await expect(info.locator('h3')).toHaveText('Накладной камень баланса')
  await expect(info.locator('.part-note')).toBeVisible()
  await expect(page.locator('.part-label[data-node="jewel_setting_3"]')).toHaveAttribute('hidden', '')
  await info.getByRole('button', { name: /Снять выделение/ }).click()
  await expect(info.locator('h3')).toHaveText('У каждой детали — своя роль')
})

test('resize and orientation preserve progress and mode, with safe projected bounds', async ({ page }) => {
  const consoleProblems: string[] = []
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push(m.text()) })
  await ready(page)
  await setProgress(page, 60)
  for (const [width, height] of [[1280, 800], [390, 844], [360, 800], [844, 390], [320, 740], [1440, 1000]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(async () => Math.abs(await progress(page) - .6)).toBeLessThan(.001)
    await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
    await page.waitForTimeout(100)
    const checked = await canvas(page).evaluate(el => ({ bounds: JSON.parse(el.dataset.bounds!), overflow: document.documentElement.scrollWidth > innerWidth + 1 }))
    expect(checked.overflow, `Overflow at ${width}x${height}`).toBe(false)
    expect(checked.bounds.minX).toBeGreaterThanOrEqual(0)
    expect(checked.bounds.minY).toBeGreaterThanOrEqual(0)
    expect(checked.bounds.maxX).toBeLessThanOrEqual(checked.bounds.width)
    expect(checked.bounds.maxY).toBeLessThanOrEqual(checked.bounds.height)
  }
  await inspect(page)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await progress(page)).toBeCloseTo(.6, 3)
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  const y = await page.evaluate(() => { window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }); return scrollY })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(150)
  // The browser may clamp the bottom when content shrinks; the app must not seek into the story.
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(3000)
  expect(y).toBeGreaterThan(2000)
  expect(consoleProblems).toEqual([])
})

test('browser scroll restoration reloads the current story configuration', async ({ page }) => {
  await ready(page)
  await setProgress(page, 63)
  await page.reload()
  await expect(slider(page)).toBeEnabled({ timeout: 60000 })
  await expect.poll(async () => Math.abs(await progress(page) - .63)).toBeLessThan(.001)
})

test('reduced motion defaults to compact manual mode and exact direct endpoints', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  const section = await page.locator('.watch-story').boundingBox()
  expect(section!.height).toBeLessThanOrEqual(1001)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('100', { timeout: 1000 })
  await page.getByRole('button', { name: 'Собрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('0', { timeout: 1000 })
  await setProgress(page, 44)
  await page.mouse.wheel(0, 250)
  expect(await progress(page)).toBe(.44)
  await page.getByRole('button', { name: 'Продолжить историю', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await setProgress(page, 0)
  const q = (await camera(page)).quaternion
  await setProgress(page, 100)
  expect((await camera(page)).quaternion).toEqual(q)
})

test('runtime reduced-motion preference preserves progress', async ({ page }) => {
  await ready(page); await setProgress(page, 40)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  expect(await progress(page)).toBe(.4)
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
})

test('loading HTTP failure has a working retry and no mandatory long story', async ({ page }) => {
  let attempts = 0
  await page.route('**/models/pocket-watch.glb', async route => {
    attempts++
    if (attempts === 1) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Controlled test failure' })
    else await route.continue()
  })
  await page.goto('/')
  await expect(slider(page)).toBeDisabled()
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click()
  await expect(slider(page)).toBeEnabled({ timeout: 60000 })
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  expect(attempts).toBe(2)
})

test('unavailable WebGL retains a loaded fallback and disables 3D controls', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (/^(webgl2?|experimental-webgl)$/.test(type)) return null
      return Reflect.apply(original, this, [type, ...args])
    } })
  })
  await page.goto('/')
  await expect(page.getByText(/WebGL 2/)).toBeVisible()
  await expect(slider(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Разобрать', exact: true })).toBeDisabled()
  const fallback = page.locator('.watch-fallback')
  await expect(fallback).toBeVisible()
  await expect.poll(() => fallback.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
})

test('WebGL context loss and restoration retain the current progress and mode', async ({ page }) => {
  await ready(page); await setProgress(page, 50)
  const supported = await canvas(page).evaluate((el: HTMLCanvasElement) => {
    const extension = el.getContext('webgl2')?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { __restore: () => void }).__restore = () => extension.restoreContext()
    extension.loseContext(); return true
  })
  expect(supported).toBe(true)
  await expect(slider(page)).toBeDisabled()
  await page.evaluate(() => (window as unknown as { __restore: () => void }).__restore())
  await expect(slider(page)).toBeEnabled({ timeout: 60000 })
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.50000')
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
})

test('200% layout density, keyboard focus and touch target sizes', async ({ page }) => {
  await ready(page); await inspect(page); await setProgress(page, 75)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 500, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 1000 })
  await slider(page).scrollIntoViewIfNeeded()
  await slider(page).focus()
  const metrics = await page.evaluate(() => {
    const range = document.querySelector<HTMLInputElement>('input[type="range"]')!
    const r = range.getBoundingClientRect(), style = getComputedStyle(range)
    return { method: '720x500 CSS viewport / DPR 2 emulates layout density of 1440x1000 at 200%; not native browser zoom', viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, slider: r.toJSON(), focusOutline: style.outlineStyle, targets: [...document.querySelectorAll<HTMLElement>('.story-controls button,.labels-toggle,input[type="range"]')].map(el => ({ text: el.textContent || el.getAttribute('aria-label'), height: el.getBoundingClientRect().height })) }
  })
  expect(metrics.scrollWidth).toBeLessThanOrEqual(721)
  expect(metrics.slider.width).toBeGreaterThan(200)
  expect(metrics.slider.left).toBeGreaterThanOrEqual(0)
  expect(metrics.slider.right).toBeLessThanOrEqual(720)
  expect(metrics.focusOutline).not.toBe('none')
  expect(metrics.targets.every(t => t.height >= 44)).toBe(true)
  await slider(page).press('Home'); await expect(slider(page)).toHaveValue('0')
  await slider(page).press('End'); await expect(slider(page)).toHaveValue('100')
  mkdirSync('docs/evidence', { recursive: true })
  writeFileSync('docs/evidence/zoom-200.json', JSON.stringify(metrics, null, 2))
  await page.screenshot({ path: 'docs/evidence/zoom-200.png' })
})

test.describe('mobile touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const swipe = async (page: Page) => {
    const r = await canvas(page).boundingBox(), cdp = await page.context().newCDPSession(page)
    const x = r!.x + r!.width * .5, from = r!.y + r!.height * .8, to = r!.y + r!.height * .25
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: from }] })
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: from + (to - from) * i / 8 }] })
      await page.waitForTimeout(25)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  test('a vertical scene swipe scrolls the story and rotates only in manual mode', async ({ page }) => {
    await ready(page)
    expect(await canvas(page).evaluate(el => getComputedStyle(el).touchAction)).toBe('pan-y')
    await swipe(page)
    await expect.poll(() => progress(page)).toBeGreaterThan(.01)
    await setProgress(page, 40); await inspect(page)
    const before = await camera(page), y = await page.evaluate(() => scrollY), frozen = await progress(page)
    expect(await canvas(page).evaluate(el => getComputedStyle(el).touchAction)).toBe('none')
    await swipe(page)
    expect((await camera(page)).quaternion).not.toEqual(before.quaternion)
    expect(await page.evaluate(() => scrollY)).toBe(y)
    expect(await progress(page)).toBe(frozen)
    await page.getByRole('button', { name: 'Продолжить историю', exact: true }).tap()
    await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
    await page.waitForTimeout(450)
    await swipe(page)
    await expect.poll(() => progress(page)).toBeGreaterThan(.41)
  })
  test('one mobile callout stays below the model; range tap and model selection work', async ({ page }) => {
    await ready(page)
    for (const p of [25, 50, 75, 100]) {
      await setProgress(page, p)
      const labels = page.locator('.part-label:not([hidden])')
      await expect(labels).toHaveCount(1)
      expect(Number(await labels.evaluate(el => getComputedStyle(el).opacity))).toBeGreaterThanOrEqual(.75)
      const label = await labels.boundingBox(), model = await canvas(page).boundingBox()
      expect(label!.y).toBeGreaterThanOrEqual(model!.y + model!.height)
      expect(label!.x).toBeGreaterThanOrEqual(0)
      expect(label!.x + label!.width).toBeLessThanOrEqual(390)
    }
    await inspect(page); await setProgress(page, 0)
    const model = await canvas(page).boundingBox()
    await canvas(page).tap({ position: { x: model!.width / 2, y: model!.height * .6 } })
    await expect(page.locator('.part-info--selected')).toHaveCount(1)
    const r = await slider(page).boundingBox()
    await slider(page).tap({ position: { x: r!.width / 2, y: r!.height / 2 } })
    expect(Number(await slider(page).inputValue())).toBeGreaterThan(45)
    expect(Number(await slider(page).inputValue())).toBeLessThan(55)
  })
})
