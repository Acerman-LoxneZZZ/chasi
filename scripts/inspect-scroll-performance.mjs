import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'

const output = 'docs/screenshots/scroll-performance'
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const shots = [], errors = []
try {
  for (const [width, height, dpr] of [[1280, 800, 1], [390, 844, 2]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, locale: 'ru-RU', reducedMotion: 'reduce' })
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(process.env.PW_BASE_URL || 'http://127.0.0.1:4174/')
    await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 90000 })
    await page.evaluate(() => document.fonts.ready)
    const entry = (await page.locator('script[type=module]').getAttribute('src')).replace(/^\.\//, '')
    for (const kind of ['balance', 'crown', 'geartrain']) {
      const host = page.locator(`.detail-scene[data-scene-kind="${kind}"]`)
      await host.scrollIntoViewIfNeeded()
      await page.waitForFunction(kind => document.querySelector(`.detail-scene[data-scene-kind="${kind}"]`).dataset.sceneStatus === 'ready', kind, { timeout: 90000 })
      const path = `${output}/${width}-${kind}.png`
      await page.screenshot({ path })
      const metrics = await host.evaluate(element => ({ ...element.dataset, sharedCanvasCount: document.querySelectorAll('canvas.detail-canvas').length, overflow: document.documentElement.scrollWidth > innerWidth + 1 }))
      assert.equal(metrics.sharedCanvasCount, 1); assert.equal(metrics.overflow, false)
      shots.push({ path, imageSha256: createHash('sha256').update(readFileSync(path)).digest('hex'), viewport: [width, height], deviceScaleFactor: dpr, entry, sha256: createHash('sha256').update(readFileSync(`dist/${entry}`)).digest('hex'), ...metrics })
    }
    await page.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(`${output}/metrics.json`, JSON.stringify({ method: 'Headless Chrome / ANGLE SwiftShader. Desktop/mobile viewport emulation; static reduced-motion pose for visual inspection, not a physical-phone or FPS test.', errors, shots }, null, 2) + '\n')
  console.log(JSON.stringify({ shots: shots.length, errors, overflow: shots.filter(shot => shot.overflow) }, null, 2))
} finally { await browser.close() }
