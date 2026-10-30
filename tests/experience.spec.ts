import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.setTimeout(240000)
const canvas = (page: Page) => page.locator('canvas.watch-canvas')
const slider = (page: Page) => page.getByRole('slider', { name: 'Разборка часов', exact: true })
const tools = (page: Page) => page.locator('details.exhibit-tools')
const progress = async (page: Page) => Number(await canvas(page).getAttribute('data-progress'))

const settled = async (page: Page) => {
  await expect.poll(() => canvas(page).evaluate(element => {
    const canonical = Number(element.dataset.progress), rendered = Number(element.dataset.renderedProgress)
    return Number.isFinite(canonical) && Number.isFinite(rendered) && Math.abs(rendered - canonical) < .00001
  }), { timeout: 60000 }).toBe(true)
}
const painted = async (page: Page) => {
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'ready', { timeout: 60000 })
  await expect.poll(() => canvas(page).evaluate(element => {
    const b = JSON.parse(element.dataset.bounds || '{}') as Record<string, unknown>
    return Number(element.dataset.drawCalls) > 0 && Number(element.dataset.triangles) > 0
      && ['minX', 'minY', 'maxX', 'maxY', 'width', 'height'].every(key => typeof b[key] === 'number' && Number.isFinite(b[key]))
      && Number(b.maxX) > Number(b.minX) && Number(b.maxY) > Number(b.minY)
      && Number(b.width) > 0 && Number(b.height) > 0
  }), { timeout: 60000 }).toBe(true)
  await page.evaluate(() => document.fonts.ready)
  await settled(page)
}
const ready = async (page: Page) => { await page.goto('/'); await painted(page) }
const camera = async (page: Page) => {
  await settled(page)
  return JSON.parse((await canvas(page).getAttribute('data-camera'))!) as { position: number[]; quaternion: number[]; target: number[] }
}
const scrollToProgress = async (page: Page, value: number) => {
  // A viewport resize can finish before ResizeObserver has published the new
  // story travel. Seek using the measured layout, rather than the previous size.
  await expect.poll(() => page.locator('.watch-story').evaluate(section => {
    const pin = section.querySelector<HTMLElement>('.story-pin')!
    return Math.abs(Number((section as HTMLElement).dataset.storyTravel) - Math.max(1, (section as HTMLElement).offsetHeight - pin.offsetHeight))
  }), { timeout: 30000 }).toBeLessThan(.5)
  await page.evaluate(p => {
    const section = document.querySelector<HTMLElement>('.watch-story')!
    window.scrollTo({ top: Number(section.dataset.storyStart) + Number(section.dataset.storyTravel) * p, behavior: 'instant' })
  }, value)
  await expect.poll(async () => Math.abs(await progress(page) - value), { timeout: 30000 }).toBeLessThan(.0006)
  await settled(page)
}
const openTools = async (page: Page) => {
  if (!await tools(page).evaluate((element: HTMLDetailsElement) => element.open)) await tools(page).locator('summary').click()
  await expect(slider(page)).toBeVisible()
}
const setManualProgress = async (page: Page, value: number) => {
  await openTools(page)
  await slider(page).evaluate((element, percent) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, String(percent))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
  await expect.poll(async () => Math.abs(await progress(page) - value / 100)).toBeLessThan(.0006)
  await settled(page)
}
const noOverflow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

test('KARpOV has five navigable product stops that hold the real camera and mechanism still', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await ready(page)
  await expect(page.getByRole('link', { name: 'KARpOV — начало коллекции', exact: true })).toBeVisible()
  await expect(page.locator('h1')).toHaveCount(1)
  await expect(page.locator('html')).toHaveClass(/\blenis\b/)
  await expect(page.locator('.watch-story')).toHaveAttribute('data-scroll-engine', 'gsap-lenis')
  const stops = page.getByRole('navigation', { name: 'Остановки знакомства с часами', exact: true })
  await expect(stops.getByRole('button')).toHaveCount(5)
  const initial = await camera(page)
  await scrollToProgress(page, .24)
  const held = await camera(page), raw = await progress(page)
  await expect(canvas(page)).toHaveAttribute('data-pose-progress', '0.22000')
  await scrollToProgress(page, .32)
  expect(await progress(page)).toBeGreaterThan(raw + .07)
  expect(await camera(page)).toEqual(held)
  await expect(canvas(page)).toHaveAttribute('data-pose-progress', '0.22000')
  await expect(page.locator('.station-copy')).toHaveAttribute('data-station', '1')
  await stops.getByRole('button', { name: 'Остановка 4: Механизм', exact: true }).click()
  await expect.poll(async () => Math.abs(await progress(page) - .78)).toBeLessThan(.001)
  await settled(page)
  await expect(canvas(page)).toHaveAttribute('data-pose-progress', '0.75000')
  await expect(canvas(page)).toHaveAttribute('data-macro', '1.00000')
  await expect(page.locator('.station-copy')).toHaveAttribute('data-station', '3')
  await expect(page.locator('.station-fact')).toContainText('Ручной завод')
  await expect(stops.getByRole('button', { name: 'Остановка 4: Механизм', exact: true })).toHaveAttribute('aria-current', 'step')
  await stops.getByRole('button', { name: 'Остановка 5: Целое', exact: true }).click()
  await expect.poll(async () => Math.abs(await progress(page) - .97)).toBeLessThan(.001)
  await expect(canvas(page)).toHaveAttribute('data-pose-progress', '1.00000')
  await scrollToProgress(page, 0)
  expect(await camera(page)).toEqual(initial)
  await noOverflow(page)
  expect(errors).toEqual([])
})

test('manual controls preserve the displayed pose and resume and reload the same story position', async ({ page }) => {
  await ready(page)
  await scrollToProgress(page, .28)
  const held = await camera(page)
  await page.getByRole('button', { name: 'Рассмотреть', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  expect(await camera(page)).toEqual(held)
  const b = await canvas(page).boundingBox()
  await page.mouse.move(b!.x + b!.width * .62, b!.y + b!.height * .5)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width * .75, b!.y + b!.height * .55, { steps: 3 })
  await page.mouse.up()
  await expect.poll(async () => JSON.stringify((await camera(page)).quaternion)).not.toBe(JSON.stringify(held.quaternion))
  const frozen = await progress(page)
  await page.evaluate(() => window.scrollBy({ top: 200, behavior: 'instant' }))
  expect(await progress(page)).toBe(frozen)
  const y = await page.evaluate(() => scrollY)
  await setManualProgress(page, 64)
  expect(await page.evaluate(() => scrollY)).toBe(y)
  await page.getByRole('button', { name: 'Закрыть управление', exact: true }).click()
  await page.locator('.mode-button').click()
  await expect(canvas(page)).toHaveAttribute('data-mode', 'story')
  await expect.poll(() => page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('.watch-story')!
    return Math.abs(scrollY - Number(section.dataset.storyStart) - .64 * Number(section.dataset.storyTravel))
  })).toBeLessThanOrEqual(1)
  await page.reload()
  await painted(page)
  await expect.poll(async () => Math.abs(await progress(page) - .64)).toBeLessThan(.001)
})

test('the collection continues through real sections and loaded artwork on desktop and mobile without overflow', async ({ page }) => {
  await ready(page)
  for (const [width, height] of [[1440, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height })
    for (const id of ['design', 'materials', 'mechanism', 'selection', 'specifications']) {
      const section = page.locator(`#${id}`)
      await section.scrollIntoViewIfNeeded()
      await expect(section.getByRole('heading').first()).toBeVisible()
      for (const image of await section.locator('img').all()) await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0), { timeout: 30000 }).toBe(true)
      await noOverflow(page)
    }
    for (const control of await page.locator('#selection .finish-option, #selection .selection-actions button, .header-selection').all()) {
      if (await control.isVisible()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('#design').scrollIntoViewIfNeeded()
  await page.locator('.desktop-menu').getByRole('link', { name: 'Материалы', exact: true }).click()
  await expect.poll(() => page.locator('#materials').evaluate(element => Math.abs(element.getBoundingClientRect().top)), { timeout: 30000 }).toBeLessThan(100)
  await page.getByRole('link', { name: 'Выбрать часы', exact: true }).click()
  await expect.poll(() => page.locator('#selection').evaluate(element => Math.abs(element.getBoundingClientRect().top)), { timeout: 30000 }).toBeLessThan(100)
  await page.setViewportSize({ width: 390, height: 844 })
  await scrollToProgress(page, .04)
  for (const control of await page.locator('.station-nav button, .exhibit-tools > summary, .header-selection').all()) expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await noOverflow(page)
})

test('three finishes persist and change the actual 3D case while keeping the same viewing pose', async ({ page }) => {
  await ready(page)
  await scrollToProgress(page, .04)
  await expect(canvas(page)).toHaveAttribute('data-finish', 'brass')
  const initialCamera = await camera(page)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const brass = await canvas(page).screenshot()
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await expect(page.getByRole('radio', { name: 'Латунь', exact: true })).toBeChecked()
  await expect(page.getByRole('radio')).toHaveCount(3)
  await page.getByRole('radio', { name: 'Сталь', exact: true }).check()
  await expect(page.locator('.selection-portrait img.is-selected')).toHaveAttribute('src', /karpov-product-steel\.webp$/)
  await page.getByRole('radio', { name: 'Графит', exact: true }).check()
  await expect(page.locator('.selection-portrait img.is-selected')).toHaveAttribute('src', /karpov-product-graphite\.webp$/)
  await expect(page.locator('#specifications')).toContainText('Графит')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('karpov:finish'))).toBe('graphite')
  await page.getByRole('button', { name: 'Посмотреть в 3D', exact: true }).click()
  await expect.poll(async () => Math.abs(await progress(page) - .04)).toBeLessThan(.001)
  await settled(page)
  await expect(canvas(page)).toHaveAttribute('data-finish', 'graphite')
  expect(await camera(page)).toEqual(initialCamera)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect((await canvas(page).screenshot()).equals(brass)).toBe(false)
  await page.reload()
  await painted(page)
  await expect(canvas(page)).toHaveAttribute('data-finish', 'graphite')
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await expect(page.getByRole('radio', { name: 'Графит', exact: true })).toBeChecked()
})

test('saving a finish downloads an honest KARpOV selection card without sending data externally', async ({ page }) => {
  const external: string[] = []
  page.on('request', request => { if (!/^http:\/\/127\.0\.0\.1:/.test(request.url()) && !/^(data|blob):/.test(request.url())) external.push(request.url()) })
  await ready(page)
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await page.getByRole('radio', { name: 'Графит', exact: true }).check()
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Сохранить выбор', exact: true }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe('KARpOV-No01-graphite.txt')
  const body = await readFile((await download.path())!, 'utf8')
  expect(body).toContain('KARpOV — Карманные часы №01')
  expect(body).toContain('Исполнение корпуса: Графит')
  expect(body).toContain('светлая эмаль')
  expect(body).toContain('Не является оформленным заказом.')
  await expect(page.locator('.selection-note')).toHaveText('Карточка выбранного исполнения скачана.')
  expect(external).toEqual([])
})

test('reduced motion keeps a compact manual viewer and the complete commercial page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await expect(canvas(page)).toHaveAttribute('data-mode', 'manual')
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
  expect((await page.locator('.watch-story').boundingBox())!.height).toBeLessThanOrEqual(1001)
  const orientation = (await camera(page)).quaternion
  await setManualProgress(page, 78)
  await expect(canvas(page)).toHaveAttribute('data-pose-progress', '0.75000')
  await expect(canvas(page)).toHaveAttribute('data-macro', '0.00000')
  const reducedQuaternion = (await camera(page)).quaternion
  expect(Math.max(...reducedQuaternion.map((value, index) => Math.abs(value - orientation[index])))).toBeLessThan(1e-12)
  await page.getByRole('button', { name: 'Закрыть управление', exact: true }).click()
  for (const id of ['design', 'materials', 'mechanism', 'selection', 'specifications']) await expect(page.locator(`#${id}`)).toBeAttached()
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Сохранить выбор', exact: true })).toBeVisible()
  await expect(page.getByRole('radio')).toHaveCount(3)
  await noOverflow(page)
})

test('a controlled model failure preserves the collection and retries with the chosen finish', async ({ page }) => {
  let requests = 0
  const rejected = page.waitForResponse(response => response.url().includes('/models/pocket-watch.glb') && response.status() === 503, { timeout: 60000 })
  await page.route('**/models/pocket-watch.glb', route => {
    requests++
    return requests === 1 ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Controlled failure' }) : route.continue()
  })
  await page.goto('/')
  await rejected
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'error')
  await expect(page.locator('.watch-story')).toHaveClass(/compact/)
  await expect(page.getByRole('button', { name: 'Детали часов', exact: true })).toBeDisabled()
  await page.locator('#selection').scrollIntoViewIfNeeded()
  await page.getByRole('radio', { name: 'Сталь', exact: true }).check()
  await expect(page.locator('#specifications')).toContainText('Сталь')
  await expect(page.locator('.watch-fallback')).toHaveAttribute('src', /karpov-product-steel\.webp$/)
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click()
  await painted(page)
  await expect(canvas(page)).toHaveAttribute('data-finish', 'steel')
  expect(requests).toBe(2)
})
