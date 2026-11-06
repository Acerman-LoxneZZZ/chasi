import { chromium } from '@playwright/test'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// Reproducible browser diagnostics. Timings describe this browser and renderer,
// not a physical phone or a guarantee about another computer's frame rate.
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'docs/evidence/scroll-performance.json'
const software = process.argv.includes('--software')
const mobile = process.argv.includes('--mobile')
const browser = await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', headless: true,
  args: software ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] })
const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
  deviceScaleFactor: mobile ? 2 : 1, locale: 'ru-RU' })
const errors = [], phases = []
page.on('pageerror', error => errors.push(error.message))
await page.addInitScript(() => {
  const qa = window.scrollQA = { tasks: [], frames: [], animations: [], contexts: [], storageWrites: 0, phase: 'loading', last: 0 }
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const start = performance.now(), context = getContext.apply(this, args)
    if (String(args[0]).startsWith('webgl') && context && !qa.contexts.some(record => record.canvas === this))
      qa.contexts.push({ canvas: this, at: start, cost: performance.now() - start, phase: qa.phase })
    return context
  }
  const setItem = Storage.prototype.setItem
  Storage.prototype.setItem = function (...args) { qa.storageWrites++; return setItem.apply(this, args) }
  new PerformanceObserver(list => { for (const entry of list.getEntries()) qa.tasks.push({ start: entry.startTime, duration: entry.duration, phase: qa.phase }) }).observe({ type: 'longtask', buffered: true })
  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) new PerformanceObserver(list => {
    for (const entry of list.getEntries()) qa.animations.push({ start: entry.startTime, duration: entry.duration, blocking: entry.blockingDuration,
      scripts: entry.scripts.map(script => ({ function: script.sourceFunctionName, url: script.sourceURL.split('/').pop(), duration: script.duration, layout: script.forcedStyleAndLayoutDuration })) })
  }).observe({ type: 'long-animation-frame', buffered: true })
  function frame(time) { if (qa.last) qa.frames.push({ at: time, duration: time - qa.last, phase: qa.phase }); qa.last = time; requestAnimationFrame(frame) }
  requestAnimationFrame(frame)
})
try {
  await page.goto(process.env.PW_BASE_URL || 'http://127.0.0.1:4174/')
  await page.locator('.experience[data-status="ready"]').waitFor({ timeout: 90000 })
  await page.evaluate(() => document.fonts.ready)
  const entry = (await page.locator('script[type=module]').getAttribute('src')).replace(/^\.\//, '')
  const environment = await page.locator('canvas.watch-canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info')
    return { renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER), userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio }
  })
  await phase('main-mechanism', async () => {
    await page.evaluate(() => { const s = document.querySelector('.watch-story'); scrollTo(0, +s.dataset.storyStart + .5 * +s.dataset.storyTravel) })
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 90); await page.waitForTimeout(70) }
    await page.waitForTimeout(300)
  })
  for (const kind of ['balance', 'crown', 'geartrain', 'engraving', 'assembly']) {
    await phase(`${kind}-enter-scroll`, async () => {
      await page.locator(`.detail-scene[data-scene-kind="${kind}"]`).evaluate(host => scrollTo(0, host.getBoundingClientRect().top + scrollY - innerHeight - 400))
      for (let i = 0; i < 24; i++) { await page.mouse.wheel(0, 65); await page.waitForTimeout(70) }
      await page.waitForTimeout(200)
    })
    const host = page.locator(`.detail-scene[data-scene-kind="${kind}"]`)
    await host.scrollIntoViewIfNeeded()
    await page.waitForFunction(kind => document.querySelector(`.detail-scene[data-scene-kind="${kind}"]`).dataset.sceneStatus === 'ready', kind, { timeout: 90000 })
    await phase(`${kind}-steady`, () => page.waitForTimeout(1600))
  }
  const data = await page.evaluate(() => ({ ...window.scrollQA, contexts: window.scrollQA.contexts.map(({ canvas, ...record }) => ({ ...record, className: canvas.className })),
    scenes: Array.from(document.querySelectorAll('.detail-scene')).map(host => ({ ...host.dataset })) }))
  const percentile = (values, p) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0 }
  const summary = phases.map(phase => {
    const frames = data.frames.filter(frame => frame.at >= phase.start && frame.at < phase.end).map(frame => frame.duration)
    const tasks = data.tasks.filter(task => task.start >= phase.start && task.start < phase.end)
    return { ...phase, frames: frames.length, frameP50: percentile(frames, .5), frameP95: percentile(frames, .95), maxFrame: Math.max(0, ...frames),
      longTasks: tasks.length, longestTask: Math.max(0, ...tasks.map(task => task.duration)), blocking: tasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0) }
  })
  const report = { createdAt: new Date().toISOString(), build: { entry, sha256: createHash('sha256').update(readFileSync(`dist/${entry}`)).digest('hex') },
    method: 'Headless Chrome, real wheel input; viewport emulation. Local diagnostics only; not physical-phone or hardware-GPU validation.', environment, errors, phases: summary, ...data }
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, build: report.build, environment, errors, phases: summary, scenes: data.scenes.map(({ sceneKind, drawCalls, modelTriangles, dpr, frames }) => ({ sceneKind, drawCalls, modelTriangles, dpr, frames })) }, null, 2))
} finally { await browser.close() }

async function phase(name, action) {
  const start = await page.evaluate(name => { window.scrollQA.phase = name; return performance.now() }, name)
  await action()
  phases.push({ name, start, end: await page.evaluate(() => performance.now()) })
  console.log(`Measured ${name}`)
}
