import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const build = read('docs/evidence/build-immersive.json')
const browserPath = 'docs/browser-immersive-full.json'
const browser = read(browserPath)
const capture = read('docs/screenshots/immersive/metrics.json')
const unit = read('docs/evidence/unit-immersive.json')
const specs = []
const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child) }
visit(browser)
assert.equal(specs.length, 13)
assert.equal(browser.stats.expected, 13)
for (const field of ['unexpected', 'skipped', 'flaky']) assert.equal(browser.stats[field], 0, field)
const tests = specs.map(spec => {
  assert.equal(spec.tests.length, 1)
  const test = spec.tests[0]
  assert.equal(test.status, 'expected', spec.title)
  assert.equal(test.results.length, 1, 'No retry can be presented as a clean full run')
  assert.equal(test.results[0].status, 'passed', spec.title)
  assert.equal(test.results[0].retry, 0)
  const entries = test.annotations.filter(a => a.type === 'tested-entry').map(a => a.description.replace(/^\.\//, ''))
  assert(entries.length > 0, `Missing actual browser entry for ${spec.title}`)
  assert(entries.every(entry => entry === build.entry), `Different production build in ${spec.title}`)
  return { title: spec.title, status: 'passed', durationMs: test.results[0].duration, entries }
})
assert.equal(unit.numTotalTests, 63)
assert.equal(unit.numPassedTests, 63)
assert.equal(unit.numFailedTests, 0)
for (const asset of build.assets) assert.equal(createHash('sha256').update(readFileSync(`dist/${asset.path}`)).digest('hex'), asset.sha256)
assert.equal(capture.build.entry, build.entry)
assert.equal(capture.build.sha256, build.assets.find(asset => asset.path === build.entry).sha256)
for (const field of ['errors', 'warnings', 'externalRequests']) assert.deepEqual(capture[field], [])
assert.equal(capture.shots.length, 36)
for (const shot of capture.shots) {
  assert(!shot.overflow)
  assert.equal(shot.headerOpacity, 0)
  assert.equal(shot.dockOpacity, 0)
  assert.equal(shot.canvasRect.width, shot.width)
  assert.equal(shot.canvasRect.height, shot.height)
  assert.equal(shot.immersive, 'true')
  // Renderer counts exclude frustum-culled parts in the intentional macro crop;
  // the independent GLB validation reports the complete 187,898-triangle model.
  assert(shot.triangles > 0 && shot.triangles <= 187898)
  if ([0, .16, .405, .67, .9].includes(shot.requestedProgress)) assert.equal(shot.captionOpacity, 0)
  else assert.equal(shot.captionOpacity, 1)
  if ([.28, .53, .97].includes(shot.requestedProgress)) {
    const b = shot.modelBounds
    assert(b.minX >= -1 && b.minY >= -1 && b.maxX <= b.width + 1 && b.maxY <= b.height + 1)
  }
}
const summary = {
  verifiedAtUtc: new Date().toISOString(), productionEntry: build.entry, sourceCommit: build.gitHead,
  passed: 13, failed: 0, skipped: 0, flaky: 0, retries: 0,
  fullRun: { path: browserPath, stats: browser.stats }, unit: { passed: 63, path: 'docs/evidence/unit-immersive.json' },
  screenshots: { count: 36, viewports: ['1440×1000', '1280×800', '390×844', '360×800'], path: 'docs/screenshots/immersive/metrics.json', pageErrors: 0, consoleProblems: 0, externalRequests: 0, horizontalOverflows: 0 },
  tests, environment: capture.environment,
  limitation: 'Headless Chrome / ANGLE SwiftShader, viewport and CDP touch emulation. No physical phone, hardware GPU FPS or new 200%-zoom/no-JS validation.',
}
writeFileSync('docs/evidence/browser-immersive-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ productionEntry: summary.productionEntry, passed: 13, unitPassed: 63, screenshots: 36, retries: 0, errors: 0 }))
