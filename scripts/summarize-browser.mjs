import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const runs = ['docs/browser-v2-full.json', 'docs/browser-test-results.json']
const tests = new Map()
function collect(suites, source, parents = []) {
  for (const suite of suites ?? []) {
    const path = [...parents, suite.title].filter(Boolean)
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      const result = test.results.at(-1)
      const title = [...path.filter(t => !t.endsWith('.spec.ts')), spec.title].join(' / ')
      tests.set(title, { title, status: result.status, durationMs: result.duration, source })
    }
    collect(suite.suites, source, path)
  }
}
for (const source of runs) collect(JSON.parse(readFileSync(source, 'utf8')).suites, source)
assert.equal(tests.size, 16, 'Expected all 16 browser scenarios')
assert([...tests.values()].every(test => test.status === 'passed'), 'Some browser scenarios still fail')
const screenshots = JSON.parse(readFileSync('docs/screenshots/scroll/metrics.json', 'utf8'))
assert.equal(screenshots.results.length, 20)
assert.equal(screenshots.errors.length + screenshots.consoleProblems.length + screenshots.externalRequests.length, 0)
for (const result of screenshots.results) {
  assert(!result.overflow)
  const b = result.bounds
  assert(b.minX >= 0 && b.minY >= 0 && b.maxX <= b.width && b.maxY <= b.height)
}
const summary = {
  verifiedAtUtc: new Date().toISOString(), passed: 16, failed: 0,
  method: '15 scenarios passed in the final full run; the mouse-pause/input scenario passed in a targeted rerun after improving test scheduling for SwiftShader. Application build unchanged. Programmatic wheel cancellation uses a real DOM wheel event, followed by native wheel scroll; native scrolling and touch are also tested separately.',
  runs, tests: [...tests.values()], screenshots: 20, projectionFailures: 0, horizontalOverflows: 0,
  environment: screenshots.environment,
}
writeFileSync('docs/evidence/browser-v2-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ passed: 16, failed: 0, screenshots: 20, projectionFailures: 0 }))
