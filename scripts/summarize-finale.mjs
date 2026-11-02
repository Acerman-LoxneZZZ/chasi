import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'

const read = path => JSON.parse(readFileSync(path, 'utf8'))
const sha = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const build = read('docs/evidence/build-finale.json')
const browserPath = 'docs/browser-finale-full.json'
const browser = read(browserPath)
const unitPath = 'docs/evidence/unit-finale.json'
const unit = read(unitPath)
const storyPath = 'docs/screenshots/finale-story/metrics.json'
const personalPath = 'docs/screenshots/finale/metrics.json'
const story = read(storyPath)
const personal = read(personalPath)
const viewports = [1440, 1280, 390, 360]
const specs = []
const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child) }
visit(browser)
assert.equal(specs.length, 19)
assert.equal(browser.stats.expected, 19)
for (const field of ['unexpected', 'skipped', 'flaky']) assert.equal(browser.stats[field], 0, field)
const tests = specs.map(spec => {
  assert.equal(spec.tests.length, 1)
  const test = spec.tests[0]
  assert.equal(test.status, 'expected', spec.title)
  assert.equal(test.results.length, 1, 'A retried run is not a clean full run')
  assert.equal(test.results[0].status, 'passed', spec.title)
  assert.equal(test.results[0].retry, 0)
  const entries = test.annotations.filter(a => a.type === 'tested-entry').map(a => a.description.replace(/^\.\//, ''))
  assert(entries.length > 0, `Missing actual browser entry for ${spec.title}`)
  assert(entries.every(entry => entry === build.entry), `Different production build in ${spec.title}`)
  return { title: spec.title, status: 'passed', durationMs: test.results[0].duration, entries }
})
assert.equal(unit.numTotalTests, 74)
assert.equal(unit.numPassedTests, 74)
assert.equal(unit.numFailedTests, 0)
assert.equal(unit.testResults.length, 9)
for (const asset of build.assets) assert.equal(sha(`dist/${asset.path}`), asset.sha256, asset.path)
const inputs = new Set()
const collect = path => {
  if (statSync(path).isDirectory()) for (const child of readdirSync(path)) collect(`${path.replace(/\/$/, '')}/${child}`)
  else inputs.add(path)
}
build.sourceTreeInputs.forEach(collect)
const records = [...inputs].sort().map(path => `${path}\0${sha(path)}\n`).join('')
assert.equal(createHash('sha256').update(records).digest('hex'), build.sourceTreeSha256, 'Source tree differs from the built inputs')
assert.equal(sha('public/models/pocket-watch.glb'), build.model.sha256)
assert.equal(sha('dist/models/pocket-watch.glb'), build.model.sha256)
assert.equal(build.model.majorCarriers, 47)
assert.equal(build.model.sourceTriangles, 187898)
assert.deepEqual(read('docs/evidence/ui-finale.json'), [])

for (const capture of [story, personal]) {
  assert.equal(capture.build.entry, build.entry)
  assert.equal(capture.build.sha256, build.assets.find(asset => asset.path === build.entry).sha256)
  for (const field of ['errors', 'warnings']) assert.deepEqual(capture[field], [])
  assert.deepEqual(capture.externalRequests ?? capture.external, [])
  assert.deepEqual([...new Set(capture.shots.map(shot => shot.width))], viewports)
  for (const shot of capture.shots) assert.equal(shot.overflow, false)
}
assert.equal(story.shots.length, 36)
for (const shot of story.shots) {
  assert.equal(shot.headerOpacity, 0)
  assert.equal(shot.dockOpacity, 0)
  assert.equal(shot.canvasRect.width, shot.width)
  assert.equal(shot.canvasRect.height, shot.height)
  assert.equal(shot.immersive, 'true')
  // Macro frustum culling can reduce submitted triangles without altering the GLB.
  assert(shot.triangles > 0 && shot.triangles <= 187898)
  assert.equal(shot.captionOpacity, [0, .16, .405, .67, .9].includes(shot.requestedProgress) ? 0 : 1)
  if ([.28, .53, .97].includes(shot.requestedProgress)) {
    const b = shot.modelBounds
    assert(b.minX >= -1 && b.minY >= -1 && b.maxX <= b.width + 1 && b.maxY <= b.height + 1)
  }
}
assert.equal(personal.shots.length, 20)
for (const width of viewports) {
  const shots = personal.shots.filter(shot => shot.width === width)
  assert.equal(shots.filter(shot => shot.kind === 'engraving').length, 1)
  assert.deepEqual(shots.filter(shot => shot.kind === 'assembly').map(shot => shot.requested), [0, .4, .78, .98])
}
for (const shot of personal.shots) {
  assert.equal(shot.canvas, true)
  assert.equal(shot.sharedCanvasCount, 1)
  assert.equal(shot.sceneStatus, 'ready')
  assert.equal(shot.active, 'true')
  assert.equal(+shot.partCount, 47)
  assert.equal(shot.finish, 'brass')
  assert.equal(shot.engraving, 'А.К.')
  assert(+shot.modelTriangles > 0 && +shot.modelTriangles <= 187900)
  assert(+shot.drawCalls > 0 && +shot.drawCalls <= 137)
  if (shot.kind === 'assembly') {
    assert.equal(+shot.headerOpacity, 0)
    assert.equal(+shot.signatureOpacity, shot.requested === .98 ? 1 : 0)
    if (shot.requested === 0) assert.equal(+shot.assemblyPose, 1)
    else if (shot.requested >= .78) assert(Math.abs(+shot.assemblyPose) < .000001)
    else assert(+shot.assemblyPose > 0 && +shot.assemblyPose < 1)
  }
}
const summary = {
  verifiedAtUtc: new Date().toISOString(), productionEntry: build.entry, sourceCommit: build.sourceCommit,
  passed: 19, failed: 0, skipped: 0, flaky: 0, retries: 0,
  fullRun: { path: browserPath, stats: browser.stats }, unit: { passed: 74, files: 9, path: unitPath },
  screenshots: { count: 56, story: { count: 36, path: storyPath }, personalization: { count: 20, path: personalPath }, viewports: ['1440×1000', '1280×800', '390×844', '360×800'], pageErrors: 0, consoleProblems: 0, externalRequests: 0, horizontalOverflows: 0 },
  model: build.model, tests, environment: story.environment,
  limitation: 'Headless Chrome / ANGLE SwiftShader, viewport and CDP touch emulation. AudioContext is real; tab hiding integration is simulated. No physical phone, hardware GPU FPS, speaker or new 200%-zoom/no-JS validation.',
}
writeFileSync('docs/evidence/browser-finale-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ productionEntry: summary.productionEntry, passed: 19, unitPassed: 74, screenshots: 56, retries: 0, errors: 0 }))
