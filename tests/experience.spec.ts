import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const slider = (page: Page) => page.getByRole('slider', { name: 'Разборка часов', exact: true })
const canvas = (page: Page) => page.locator('canvas')
const ready = async (page: Page) => {
  await page.goto('/')
  await expect(slider(page)).toBeEnabled({ timeout: 60_000 })
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  await page.evaluate(() => document.fonts.ready)
}
const setProgress = async (page: Page, percent: number) => {
  await slider(page).evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(element, String(value))
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }, percent)
  await expect(slider(page)).toHaveValue(String(percent))
  await expect(canvas(page)).toHaveAttribute('data-progress', (percent / 100).toFixed(5))
}

test('native keyboard control, continuous progress, exact return and one model request', async ({ page }) => {
  const pageErrors: string[] = []
  const failedResources: string[] = []
  let modelRequests = 0
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('response', response => { if (response.status() >= 400) failedResources.push(`${response.status()} ${response.url()}`) })
  page.on('request', request => { if (request.url().includes('/models/pocket-watch.glb')) modelRequests++ })
  await ready(page)
  await expect(slider(page)).toHaveAttribute('min', '0')
  await expect(slider(page)).toHaveAttribute('max', '100')
  await slider(page).focus()
  await slider(page).press('End')
  await expect(slider(page)).toHaveValue('100')
  await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000')
  await slider(page).press('Home')
  await expect(slider(page)).toHaveValue('0')
  await slider(page).press('ArrowRight')
  expect(Number(await slider(page).inputValue())).toBeGreaterThan(0)
  await expect(slider(page)).toHaveAttribute('aria-valuetext', /Разобрано/)
  for (const percent of [25, 50, 75, 100, 1, 99, 13.7, 0]) await setProgress(page, percent)
  expect(modelRequests).toBe(1)
  expect(pageErrors).toEqual([])
  expect(failedResources).toEqual([])
})

test('automatic movement pauses, reverses, yields to manual input and completes', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect.poll(async () => Number(await slider(page).inputValue())).toBeGreaterThan(2)
  await page.getByRole('button', { name: /Пауза|Остановить/, exact: false }).click()
  const paused = await slider(page).inputValue()
  await page.waitForTimeout(300)
  await expect(slider(page)).toHaveValue(paused)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await setProgress(page, 52.3)
  await page.waitForTimeout(300)
  await expect(slider(page)).toHaveValue('52.3')
  await page.getByRole('button', { name: 'Собрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('0', { timeout: 30_000 })
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('100', { timeout: 45_000 })
})

test('labels, camera rotation, reset and accessible selection preserve progress', async ({ page }) => {
  await ready(page)
  await setProgress(page, 65)
  const toggle = page.getByRole('checkbox', { name: 'Подписи деталей', exact: true })
  await toggle.click()
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.65000')
  await toggle.click()
  const bounds = await canvas(page).boundingBox()
  expect(bounds).not.toBeNull()
  await page.mouse.move(bounds!.x + bounds!.width * 0.5, bounds!.y + bounds!.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds!.x + bounds!.width * 0.65, bounds!.y + bounds!.height * 0.54, { steps: 12 })
  await page.mouse.up()
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.65000')
  await page.getByRole('button', { name: 'Сбросить вид', exact: true }).click()
  await expect(slider(page)).toHaveValue('65')
  // The DOM list gives keyboard users access to the same major nodes as ray casting.
  await page.getByRole('button', { name: /^Циферблат/ }).click()
  const info = page.locator('.anatomy-layout .part-info')
  await expect(info.locator('h3')).toHaveText(/^Циферблат/)
  await expect(info.locator('p')).not.toBeEmpty()
  await expect(info.locator('.part-material')).toBeVisible()
  await info.getByRole('button', { name: /Снять выделение|Закрыть сведения/ }).click()
  await expect(slider(page)).toHaveValue('65')
})

test('responsive composition retains progress and has no horizontal overflow', async ({ page }) => {
  const consoleProblems: string[] = []
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleProblems.push(message.text()) })
  await ready(page)
  const environment = await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext('webgl2')!
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    return { userAgent: navigator.userAgent, initialViewport: [innerWidth, innerHeight], devicePixelRatio, webglVersion: gl.getParameter(gl.VERSION), renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }
  })
  await setProgress(page, 100)
  for (const [width, height] of [[320, 740], [360, 800], [390, 844], [768, 1024], [1280, 800], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await expect(slider(page)).toHaveValue('100')
    await expect(canvas(page)).toHaveAttribute('data-progress', '1.00000')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `Horizontal overflow at ${width}x${height}`).toBe(true)
    const rect = await slider(page).boundingBox()
    expect(rect!.width).toBeGreaterThan(200)
  }
  // 720 CSS pixels at DPR 2 reproduce the layout density of a 1440px display at 200%.
  // This is explicit viewport emulation, not a claim about native browser zoom controls.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 720, height: 500, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 1000 })
  await expect.poll(() => page.evaluate(() => innerWidth)).toBe(720)
  await slider(page).scrollIntoViewIfNeeded()
  const zoom = await page.evaluate(() => {
    const range = document.querySelector<HTMLInputElement>('input[type="range"]')!
    const bounds = range.getBoundingClientRect()
    return { method: '720x500 CSS viewport at DPR 2, equivalent layout density to 1440x1000 at 200%; not native browser zoom', viewport: [innerWidth, innerHeight], devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, slider: bounds.toJSON(), value: range.value, enabled: !range.disabled }
  })
  expect(zoom.scrollWidth).toBeLessThanOrEqual(721)
  expect(zoom.enabled).toBe(true)
  expect(zoom.value).toBe('100')
  expect(zoom.slider.left).toBeGreaterThanOrEqual(0)
  expect(zoom.slider.right).toBeLessThanOrEqual(721)
  expect(zoom.slider.height).toBeGreaterThanOrEqual(44)
  mkdirSync('docs/evidence', { recursive: true })
  writeFileSync('docs/evidence/zoom-200.json', JSON.stringify(zoom, null, 2) + '\n')
  writeFileSync('docs/evidence/browser-environment.json', JSON.stringify({ ...environment, consoleProblems }, null, 2) + '\n')
  await page.screenshot({ path: 'docs/evidence/zoom-200.png' })
  expect(consoleProblems).toEqual([])
})

test('reduced-motion controls set exact endpoints immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page)
  await page.getByRole('button', { name: 'Разобрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('100', { timeout: 1000 })
  await page.getByRole('button', { name: 'Собрать', exact: true }).click()
  await expect(slider(page)).toHaveValue('0', { timeout: 1000 })
})

test('failed model loading shows a real retry that requests the resource again', async ({ page }) => {
  let attempts = 0
  await page.route('**/models/pocket-watch.glb', async route => {
    attempts++
    if (attempts === 1) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Controlled test failure' })
    else await route.continue()
  })
  await page.goto('/')
  await expect(slider(page)).toBeDisabled()
  await page.getByRole('button', { name: /Повторить|Попробовать/ }).click()
  await expect(slider(page)).toBeEnabled({ timeout: 60_000 })
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.00000')
  expect(attempts).toBe(2)
})

test('unavailable WebGL shows the fallback and disables inoperative controls', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
        return Reflect.apply(original, this, [type, ...args])
      },
    })
  })
  await page.goto('/')
  await expect(page.getByText(/WebGL|поддержк[аи] 3D/i).first()).toBeVisible()
  await expect(slider(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Разобрать', exact: true })).toBeDisabled()
  const fallback = page.locator('img[src*="watch-fallback"]')
  await expect(fallback).toBeVisible()
  await expect.poll(async () => fallback.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
})

test('context loss is handled and restoration reinitializes the scene', async ({ page }) => {
  await ready(page)
  await setProgress(page, 50)
  const supported = await canvas(page).evaluate((element: HTMLCanvasElement) => {
    const gl = element.getContext('webgl2')
    const extension = gl?.getExtension('WEBGL_lose_context')
    if (!extension) return false
    ;(window as unknown as { __testRestoreContext: () => void }).__testRestoreContext = () => extension.restoreContext()
    extension.loseContext()
    return true
  })
  test.skip(!supported, 'Chrome did not expose WEBGL_lose_context')
  await expect(slider(page)).toBeDisabled()
  await page.evaluate(() => (window as unknown as { __testRestoreContext: () => void }).__testRestoreContext())
  await expect(slider(page)).toBeEnabled({ timeout: 60_000 })
  await expect(slider(page)).toHaveValue('50')
  await expect(canvas(page)).toHaveAttribute('data-progress', '0.50000')
})

test('save desktop and mobile evidence for the assembled and exploded model', async ({ page }) => {
  mkdirSync('docs/screenshots', { recursive: true })
  await ready(page)
  for (const percent of [0, 50, 100]) {
    await setProgress(page, percent)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `docs/screenshots/desktop-${percent}.png`, fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  for (const percent of [0, 100]) {
    await setProgress(page, percent)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(200)
    await page.screenshot({ path: `docs/screenshots/mobile-${percent}.png`, fullPage: true })
  }
})

test.describe('mobile touch interaction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('touch selection and a native range tap work in the mobile viewport', async ({ page }) => {
    await ready(page)
    const bounds = await canvas(page).boundingBox()
    await canvas(page).tap({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } })
    await expect(page.locator('.anatomy-layout .part-info--selected')).toBeVisible()
    await page.locator('.anatomy-layout').getByRole('button', { name: /Снять выделение/ }).click()
    const rangeBounds = await slider(page).boundingBox()
    await slider(page).tap({ position: { x: rangeBounds!.width / 2, y: rangeBounds!.height / 2 } })
    const value = Number(await slider(page).inputValue())
    expect(value).toBeGreaterThan(45)
    expect(value).toBeLessThan(55)
    await expect(canvas(page)).toHaveAttribute('data-progress', (value / 100).toFixed(5))
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
})
