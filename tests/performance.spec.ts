import { expect, test } from '@playwright/test'

test('a saturated detail renderer preserves the scroll frame budget and paints the latest queued pose', async ({ page }) => {
  test.setTimeout(180000)
  await page.addInitScript(() => {
    const qa = window as unknown as { slowDetailDraw: boolean }
    qa.slowDetailDraw = true
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      const context = original.call(this, type, ...args as [])
      if (context && this.classList.contains('detail-canvas') && type === 'webgl2') {
        const gl = context as WebGL2RenderingContext
        for (const method of ['drawElements', 'drawElementsInstanced', 'drawArrays'] as const) {
          const draw = gl[method].bind(gl)
          Object.defineProperty(gl, method, { value: (...values: number[]) => {
            // Controlled CPU saturation to exercise quality fallback, then
            // remove it before measuring the scroll-triggered render rate.
            if (qa.slowDetailDraw) { const end = performance.now() + 2; while (performance.now() < end) { /* simulated cost */ } }
            return (draw as (...values: number[]) => void)(...values)
          } })
        }
      }
      return context
    } as typeof original
  })
  await page.setViewportSize({ width: 800, height: 600 })
  await page.goto('/')
  await expect(page.locator('.experience')).toHaveAttribute('data-status', 'ready', { timeout: 90000 })
  test.info().annotations.push({ type: 'tested-entry', description: (await page.locator('script[type="module"]').getAttribute('src'))! })
  // A small surface allows a fast GPU to reach 60 Hz after the injected cost
  // is removed. It exposes the old dirty=true bypass of the 30 Hz fallback.
  await page.addStyleTag({ content: '.movement-portrait { width: 200px !important; height: 200px !important; min-height: 0 !important; }' })
  const host = page.locator('.detail-scene[data-scene-kind="geartrain"]')
  await host.scrollIntoViewIfNeeded()
  await expect(host).toHaveAttribute('data-scene-status', 'ready', { timeout: 90000 })
  await expect.poll(async () => Number(await host.getAttribute('data-dpr')), { timeout: 60000 }).toBeLessThanOrEqual(.85)
  await page.evaluate(() => { (window as unknown as { slowDetailDraw: boolean }).slowDetailDraw = false })
  await page.waitForTimeout(300)
  const result = await host.evaluate(async element => {
    const before = Number(element.dataset.frames), base = scrollY, start = performance.now()
    await new Promise<void>(resolve => {
      const move = () => {
        const elapsed = performance.now() - start
        scrollTo(0, base + Math.sin(elapsed / 240) * 60)
        if (elapsed < 1800) requestAnimationFrame(move)
        else resolve()
      }
      requestAnimationFrame(move)
    })
    return { frames: Number(element.dataset.frames) - before, elapsed: performance.now() - start }
  })
  expect(result.frames).toBeGreaterThan(0)
  expect(result.frames).toBeLessThanOrEqual(Math.ceil(result.elapsed / 1000 * 33) + 2)
  await expect.poll(() => host.evaluate(element => element.dataset.renderedProgress === element.dataset.progress)).toBe(true)
  const calls = Number(await host.getAttribute('data-draw-calls'))
  expect(calls).toBeLessThanOrEqual(30)
  await expect(page.locator('canvas.detail-canvas')).toHaveCount(1)
})
