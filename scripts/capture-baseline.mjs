import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://127.0.0.1:5173/')
  await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  mkdirSync('docs/screenshots/before', { recursive: true })
  for (const percent of [0, 100]) {
    await page.locator('input[type="range"]').evaluate((el, p) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(p))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, percent)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `docs/screenshots/before/original-desktop-${percent}.png` })
    await page.locator('canvas').screenshot({ path: `docs/screenshots/before/original-model-${percent}.png` })
  }
  writeFileSync('docs/evidence/baseline.json', JSON.stringify({ capturedAt: new Date().toISOString(), viewport: [1440, 1000], source: 'Unmodified first-version code and GLB before scroll redesign', renderer: 'Chrome headless / ANGLE SwiftShader' }, null, 2))
} finally { await browser.close() }
