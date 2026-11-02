import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const out = process.argv[2] || 'docs/screenshots/immersive'
mkdirSync(out, { recursive: true })
const baseURL = process.env.PW_BASE_URL || 'http://127.0.0.1:4174/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' })
const errors = [], warnings = [], externalRequests = [], shots = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (['error', 'warning'].includes(m.type())) warnings.push(m.text()) })
page.on('request', r => { if (!r.url().startsWith(baseURL.replace(/\/$/, '')) && !/^(data|blob):/.test(r.url())) externalRequests.push(r.url()) })
try {
  await page.goto(baseURL)
  await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.fonts.ready)
  const environment = await page.locator('canvas.watch-canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { userAgent: navigator.userAgent, renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), entry: document.querySelector('script[type=module]').getAttribute('src'), method: 'Headless Chrome / ANGLE SwiftShader; viewport emulation, not a physical phone or hardware FPS measurement' }
  })
  const entry = environment.entry.replace(/^\.\//, '')
  const build = { entry, sha256: createHash('sha256').update(readFileSync(`dist/${entry}`)).digest('hex') }
  for (const [width, height] of [[1440, 1000], [1280, 800], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height })
    await page.mouse.move(width / 2, height / 2)
    await page.waitForFunction(() => {
      const s = document.querySelector('.watch-story'), pin = s.querySelector('.story-pin')
      return Math.abs(+s.dataset.storyTravel - (s.offsetHeight - pin.offsetHeight)) < .5
    })
    for (const progress of [0, .16, .28, .405, .53, .67, .78, .9, .97]) {
      await page.evaluate(p => {
        const s = document.querySelector('.watch-story')
        scrollTo({ top: +s.dataset.storyStart + +s.dataset.storyTravel * p, behavior: 'instant' })
      }, progress)
      await page.waitForFunction(p => {
        const c = document.querySelector('canvas.watch-canvas')
        return Math.abs(+c.dataset.progress - p) < .0006 && c.dataset.renderedProgress === c.dataset.progress
      }, progress, { timeout: 60000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${out}/${width}-${progress}.png` })
      shots.push(await page.evaluate(p => {
        const c = document.querySelector('canvas.watch-canvas'), root = document.querySelector('.karpov-site')
        const style = selector => Number(getComputedStyle(document.querySelector(selector)).opacity)
        return { width: innerWidth, height: innerHeight, requestedProgress: p, progress: c.dataset.progress, pose: c.dataset.poseProgress, macro: c.dataset.macro, immersive: root.dataset.immersive, ui: root.dataset.cinemaUi, headerOpacity: style('.site-header'), dockOpacity: style('.exhibit-dock'), captionOpacity: style('.station-copy'), canvasRect: c.getBoundingClientRect().toJSON(), modelBounds: JSON.parse(c.dataset.bounds), camera: JSON.parse(c.dataset.camera), triangles: +c.dataset.triangles, drawCalls: +c.dataset.drawCalls, overflow: document.documentElement.scrollWidth > innerWidth + 1 }
      }, progress))
    }
  }
  writeFileSync(`${out}/metrics.json`, JSON.stringify({ build, environment, errors, warnings, externalRequests, shots }, null, 2) + '\n')
  console.log(JSON.stringify({ build, shots: shots.length, errors, warnings, externalRequests, overflow: shots.filter(s => s.overflow).length }))
} finally { await browser.close() }
