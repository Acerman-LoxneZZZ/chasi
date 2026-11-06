import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const build = read('docs/evidence/build-scroll-performance.json')
for (const file of build.sources) assert.equal(sha(file.path), file.sha256, file.path)
for (const file of build.assets) assert.equal(sha(`dist/${file.path}`), file.sha256, file.path)
assert.equal(sha('dist/models/pocket-watch.glb'), build.model.sha256)
const lighting = read('docs/evidence/detail-lighting.json')
assert.equal(sha('public/lighting/detail-room.bin'), lighting.sha256)
assert.equal(sha('dist/lighting/detail-room.bin'), lighting.sha256)
assert.equal(lighting.validation.maxPixelDeviation, 0)
const unit = read('docs/evidence/unit-scroll-performance.json')
assert.equal(unit.success, true); assert.equal(unit.numTotalTests, 79); assert.equal(unit.numPassedTests, 79); assert.equal(unit.numFailedTests, 0)
const browser = read('docs/browser-scroll-performance.json')
function collect(suite, run, scenarios = []) {
  for (const spec of suite.specs || []) for (const test of spec.tests) {
    assert.equal(test.expectedStatus, 'passed', spec.title)
    assert.equal(test.results.length, 1, spec.title)
    const result = test.results[0]
    assert.equal(result.retry, 0)
    const entries = test.annotations.filter(annotation => annotation.type === 'tested-entry')
    assert.ok(entries.length > 0, spec.title)
    for (const entry of entries) assert.equal(entry.description.replace(/^\.\//, ''), build.entry, spec.title)
    scenarios.push({ title: spec.title, entry: build.entry, duration: result.duration, status: result.status, errors: result.errors.map(error => error.message), run })
  }
  for (const child of suite.suites || []) collect(child, run, scenarios)
  return scenarios
}
const initial = collect(browser, 'full')
assert.equal(initial.length, 20); assert.equal(browser.errors.length, 0)
const failures = initial.filter(scenario => scenario.status !== 'passed')
const latest = new Map(initial.map(scenario => [scenario.title, scenario]))
let targeted = []
if (failures.length) {
  // Preserve the full run's failures. A separate same-build navigation run may
  // confirm those exact cases after allowing software WebGL more than 15 s.
  // Never silently call this a clean one-pass suite or merge different builds.
  for (const failure of failures) {
    assert.ok(/five navigable product stops|three finishes persist/.test(failure.title), failure.title)
    assert.ok(failure.errors.some(error => /Timeout 15000ms/.test(error)), failure.title)
  }
  const report = read('docs/browser-scroll-performance-navigation.json')
  assert.equal(report.errors.length, 0)
  targeted = collect(report, 'targeted-navigation-60s')
  assert.equal(targeted.length, failures.length)
  for (const scenario of targeted) {
    assert.ok(failures.some(failure => failure.title === scenario.title))
    assert.equal(scenario.status, 'passed', scenario.title)
    assert.equal(scenario.errors.length, 0, scenario.title)
    latest.set(scenario.title, scenario)
  }
}
const scenarios = [...latest.values()]
assert.equal(scenarios.length, 20)
for (const scenario of scenarios) { assert.equal(scenario.status, 'passed', scenario.title); assert.equal(scenario.errors.length, 0) }
const before = read('docs/evidence/scroll-performance-before.json'), after = read('docs/evidence/scroll-performance-after.json')
assert.equal(after.build.entry, build.entry)
assert.equal(after.build.sha256, sha(`dist/${build.entry}`))
assert.deepEqual(after.errors, [])
const resources = ['balance', 'crown', 'geartrain'].map(kind => {
  const old = before.scenes.find(scene => scene.sceneKind === kind), next = after.scenes.find(scene => scene.sceneKind === kind)
  assert.equal(next.modelTriangles, old.modelTriangles)
  assert.ok(+next.drawCalls < +old.drawCalls)
  return { kind, triangles: +next.modelTriangles, callsBefore: +old.drawCalls, callsAfter: +next.drawCalls }
})
const screenshots = read('docs/screenshots/scroll-performance/metrics.json')
assert.equal(screenshots.shots.length, 6); assert.deepEqual(screenshots.errors, [])
for (const shot of screenshots.shots) {
  assert.equal(shot.entry, build.entry); assert.equal(shot.sha256, after.build.sha256)
  assert.equal(sha(shot.path), shot.imageSha256)
  assert.equal(shot.sceneStatus, 'ready'); assert.equal(shot.sharedCanvasCount, 1); assert.equal(shot.overflow, false)
}
const summary = { createdAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  entry: build.entry, sha256: after.build.sha256, unit: { passed: 79, total: 79 }, browser: { verifiedUniqueScenarios: 20, total: 20, fullRunPassed: initial.length - failures.length,
    fullRunFailed: failures.length, manualReruns: targeted.length, targetedPassed: targeted.length, frameworkRetries: 0, workers: browser.config.workers, durationMs: browser.stats.duration },
  initialFailures: failures, scenarios, resources, lighting, visualShots: screenshots.shots.map(shot => shot.path),
  method: 'Software WebGL diagnostics and viewport emulation; raw timings are not hardware-GPU FPS or physical-phone validation.' }
writeFileSync('docs/evidence/scroll-performance-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ entry: summary.entry, unit: summary.unit, browser: summary.browser, resources, visualShots: 6 }, null, 2))
