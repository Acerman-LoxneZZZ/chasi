import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

const output = process.argv[2] || '.cache/watch-preview'
const comparison = process.argv.includes('--comparison')
const quick = process.argv.includes('--quick')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'ru-RU' })
  const trace = []
  if (process.argv.includes('--debug')) {
    page.on('console', message => { if (message.text().startsWith('__WATCH_TRACE__')) trace.push(JSON.parse(message.text().slice(15))) })
    await page.addInitScript(() => {
      const log = (type, extra = {}) => console.debug('__WATCH_TRACE__' + JSON.stringify({ type, y: scrollY, time: performance.now(), ready: document.readyState, p: document.querySelector('canvas')?.dataset.progress, state: history.state, ...extra }))
      const native = window.scrollTo.bind(window)
      window.scrollTo = (...args) => { native(...args); log('scrollTo', { args, stack: new Error().stack }) }
      const replace = history.replaceState.bind(history)
      history.replaceState = (...args) => { replace(...args); log('replaceState') }
      for (const event of ['load', 'pageshow', 'pagehide', 'scroll']) window.addEventListener(event, () => log(event))
    })
  }
  if (process.argv.includes('--old-model')) await page.route('**/models/pocket-watch.glb', route => route.fulfill({ contentType: 'model/gltf-binary', body: readFileSync('artifacts/baseline/pocket-watch.glb') }))
  const errors = []
  const consoleProblems = [], externalRequests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleProblems.push(m.text()) })
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:') && !r.url().startsWith('data:')) externalRequests.push(r.url()) })
  await page.goto(process.env.PW_BASE_URL || 'http://127.0.0.1:5173/')
  await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 60000 })
  await page.evaluate(() => document.fonts.ready)
  const environment = await page.locator('canvas').evaluate(el => {
    const gl = el.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info')
    return { userAgent: navigator.userAgent, devicePixelRatio, webglVersion: gl.getParameter(gl.VERSION), renderer: gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER), method: 'Chrome headless with ANGLE SwiftShader; viewport/touch emulation, not a physical phone or hardware GPU benchmark' }
  })
  if (process.argv.includes('--debug')) {
    await page.locator('input[type="range"]').evaluate(el => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '63')
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.reload()
    await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 60000 })
    await page.waitForTimeout(400)
    console.log(JSON.stringify({ trace, final: await page.evaluate(() => ({ y: scrollY, p: document.querySelector('canvas').dataset.progress, state: history.state })) }, null, 2))
  }
  if (comparison) {
    await page.getByRole('button', { name: 'Рассмотреть', exact: true }).click()
    await page.addStyleTag({ content: '.site-header,.story-heading,.story-controls,.scene-meta,.scene-labels,.mobile-scene-invitation{display:none!important}.watch-story{height:100svh}.story-pin{height:100svh;min-height:0;padding:0;display:block}.story-stage{height:100svh}.canvas-wrap{inset:0}' })
    await page.waitForTimeout(300)
    for (const percent of [0, 75, 100]) {
      await page.locator('input[type="range"]').evaluate((el, p) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(p))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        ;[...document.querySelectorAll('button')].find(button => button.textContent.includes('Сбросить вид')).click()
      }, percent)
      await page.waitForTimeout(300)
      await page.locator('canvas').screenshot({ path: `${output}/model-${percent}.png` })
      results.push({ percent, viewport: [1440, 1000], comparison: true, camera: JSON.parse(await page.locator('canvas').getAttribute('data-camera')) })
    }
  }
  for (const [width, height] of (process.argv.includes('--debug') || comparison ? [] : quick ? [[1440, 1000], [390, 844]] : [[1440, 1000], [1280, 800], [390, 844], [360, 800]])) {
    await page.setViewportSize({ width, height })
    await page.waitForTimeout(150)
    for (const percent of (quick ? [0, 50, 100] : [0, 25, 50, 75, 100])) {
      await page.evaluate(p => {
        const section = document.querySelector('.watch-story')
        window.scrollTo({ top: Number(section.dataset.storyStart) + Number(section.dataset.storyTravel) * p / 100, behavior: 'instant' })
      }, percent)
      await page.waitForTimeout(250)
      await page.waitForFunction(() => {
        const canvas = document.querySelector('canvas')
        return canvas?.dataset.renderedProgress === canvas?.dataset.progress
      }, undefined, { timeout: 15000 })
      // Allow a completed WebGL frame to reach the compositor after DPR changes.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      await page.screenshot({ path: `${output}/${width}x${height}-${percent}.png` })
      const metrics = await page.locator('canvas').evaluate(el => ({ progress: Number(el.dataset.progress), bounds: JSON.parse(el.dataset.bounds || '{}'), camera: JSON.parse(el.dataset.camera || '{}'), labels: [...document.querySelectorAll('.part-label:not([hidden])')].map(label => ({ node: label.dataset.node, text: label.textContent, bounds: label.getBoundingClientRect().toJSON() })), drawCalls: el.dataset.drawCalls, triangles: el.dataset.triangles, dpr: el.dataset.dpr, canvas: el.getBoundingClientRect().toJSON(), overflow: document.documentElement.scrollWidth > innerWidth + 1, scrollY }))
      results.push({ viewport: [width, height], percent, ...metrics })
    }
  }
  writeFileSync(`${output}/metrics.json`, JSON.stringify({ environment, results, errors, consoleProblems, externalRequests }, null, 2))
  console.log(JSON.stringify({ output, screenshots: results.length, errors, consoleProblems, externalRequests, boundsFailures: results.filter(r => r.bounds && (r.bounds.minX < 0 || r.bounds.minY < 0 || r.bounds.maxX > r.bounds.width || r.bounds.maxY > r.bounds.height)).map(r => [r.viewport, r.percent]), overflows: results.filter(r => r.overflow).length }, null, 2))
} finally { await browser.close() }
