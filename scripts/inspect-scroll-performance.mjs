import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

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
      await page.waitForFunction(kind => {
        const host = document.querySelector(`.detail-scene[data-scene-kind="${kind}"]`)
        return host.dataset.sceneStatus === 'ready' && host.dataset.active === 'true' && !!host.querySelector('canvas.detail-canvas')
      }, kind, { timeout: 90000 })
      const path = `${output}/${width}-${kind}.png`
      let goldPixelRatio = 0
      for (let attempt = 0; attempt < 2 && goldPixelRatio < .002; attempt++) {
        // A ready CPU draw can still be in flight or be followed by the adaptive
        // DPR resize. Wait for presentation, then verify actual metal pixels.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve)))))
        await page.screenshot({ path })
        const box = await host.boundingBox()
        const check = spawnSync('python3', ['-c', 'from PIL import Image; import sys,json; im=Image.open(sys.argv[1]).convert("RGB"); b=json.loads(sys.argv[2]); d=float(sys.argv[3]); r=[max(0,int(b["x"]*d)),max(0,int(b["y"]*d)),min(im.width,int((b["x"]+b["width"])*d)),min(im.height,int((b["y"]+b["height"])*d))]; pixels=list(im.crop(r).getdata()); print(sum(a>90 and a>c*1.08 and c>e*1.1 for a,c,e in pixels)/max(1,len(pixels)))', path, JSON.stringify(box), String(dpr)], { encoding: 'utf8' })
        assert.equal(check.status, 0, check.stderr)
        goldPixelRatio = Number(check.stdout)
      }
      assert.ok(goldPixelRatio > .002, `${kind}: empty or unpresented WebGL screenshot`)
      const metrics = await host.evaluate(element => ({ ...element.dataset, sharedCanvasCount: document.querySelectorAll('canvas.detail-canvas').length, overflow: document.documentElement.scrollWidth > innerWidth + 1 }))
      assert.equal(metrics.sharedCanvasCount, 1); assert.equal(metrics.overflow, false)
      shots.push({ path, goldPixelRatio, imageSha256: createHash('sha256').update(readFileSync(path)).digest('hex'), viewport: [width, height], deviceScaleFactor: dpr, entry, sha256: createHash('sha256').update(readFileSync(`dist/${entry}`)).digest('hex'), ...metrics })
    }
    await page.close()
  }
  assert.deepEqual(errors, [])
  writeFileSync(`${output}/metrics.json`, JSON.stringify({ method: 'Headless Chrome / ANGLE SwiftShader. Desktop/mobile viewport emulation; static reduced-motion pose for visual inspection, not a physical-phone or FPS test.', errors, shots }, null, 2) + '\n')
  console.log(JSON.stringify({ shots: shots.length, errors, overflow: shots.filter(shot => shot.overflow) }, null, 2))
} finally { await browser.close() }
