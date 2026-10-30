import { readFileSync, writeFileSync } from 'node:fs'

const read = name => JSON.parse(readFileSync(name, 'utf8'))
const fullPath = 'docs/browser-v4-full.json'
const targetedPath = 'docs/browser-v4-targeted.json'
const full = read(fullPath), targeted = read(targetedPath)
const collect = report => {
  const specs = []
  const visit = suite => {
    specs.push(...(suite.specs || []))
    for (const child of suite.suites || []) visit(child)
  }
  visit(report)
  return specs
}
const passed = spec => spec.tests.length > 0 && spec.tests.every(test => test.results.some(result => result.status === 'passed') && test.status === 'expected')
const complete = collect(full), repeats = collect(targeted)
if (complete.length !== 10 || repeats.length !== 1 || !passed(repeats[0])) throw new Error('Expected 10 full scenarios and one successful focused repeat')
const scenarios = complete.map(spec => {
  const repeat = repeats.find(item => item.title === spec.title)
  const source = passed(spec) ? fullPath : repeat && passed(repeat) ? targetedPath : null
  if (!source) throw new Error(`No passing evidence for ${spec.title}`)
  return { title: spec.title, status: 'passed', source }
})
const summary = {
  status: 'passed', scenarios: scenarios.length,
  productionEntry: read('docs/evidence/build-v4.json').entry,
  fullRun: { source: fullPath, stats: full.stats },
  focusedRepeat: { source: targetedPath, stats: targeted.stats },
  note: 'Nine scenarios passed in the full two-worker run. The controlled-503 scenario initially asserted before software PMREM initialization had started its fetch. Its test now awaits the actual 503 response before asserting the error and retry. Application code and production build did not change for the focused repeat. This is not one entirely green full run.',
  results: scenarios,
}
writeFileSync('docs/evidence/browser-v4-summary.json', JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({ status: summary.status, scenarios: scenarios.length, full: full.stats, targeted: targeted.stats }, null, 2))
