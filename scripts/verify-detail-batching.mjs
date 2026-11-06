import ts from 'typescript'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { Matrix3, Matrix4, Mesh, InstancedMesh, Vector3 } from 'three'

const baseline = process.argv[2] || '8c6768ddd2b9da83ae00b87154f38f81a259a221'
const path = 'src/scene/detailModels.ts'
async function load(source) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
    .replace(/from ['"](three(?:\/[^'"]+)?)['"]/g, (_, specifier) => `from ${JSON.stringify(import.meta.resolve(specifier))}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)).createDetailModels()
}
const before = await load(execFileSync('git', ['show', `${baseline}:${path}`], { encoding: 'utf8' }))
const after = await load(readFileSync(path, 'utf8'))
const checks = []
try {
  for (const kind of ['balance', 'crown', 'geartrain']) {
    for (const [progress, time] of [[0, 0], [.3, 1], [.75, 5], [1, 10], [.3, 1]]) {
      before[kind].update(progress, time, false); after[kind].update(progress, time, false)
      const old = describe(before[kind].root), next = describe(after[kind].root)
      assert.deepEqual(Object.keys(next.surfaces).sort(), Object.keys(old.surfaces).sort())
      let maxDeviation = 0
      for (const [material, original] of Object.entries(old.surfaces)) {
        const batched = next.surfaces[material]
        assert.equal(batched.vertices, original.vertices)
        for (const field of ['mean', 'meanSquare', 'normal', 'min', 'max']) for (let axis = 0; axis < 3; axis++) {
          const error = Math.abs(original[field][axis] - batched[field][axis])
          maxDeviation = Math.max(maxDeviation, error)
          assert.ok(error < 1e-6, `${kind} / ${material} / ${field}: ${error}`)
        }
      }
      assert.ok(next.calls < old.calls)
      checks.push({ kind, progress, time, triangles: next.triangles, callsBefore: old.calls, callsAfter: next.calls, maxDeviation })
    }
  }
  writeFileSync('docs/evidence/detail-batching.json', JSON.stringify({ baseline, method: 'Original and batched Three.js geometry, expanded instancing; per-material indexed vertex counts, world bounds, position/normal moments, five reversible moving poses. Tolerance 1e-6.', checks }, null, 2) + '\n')
  console.log(JSON.stringify(checks.filter(check => check.progress === 0), null, 2))
} finally { Object.values(before).forEach(model => model.dispose()); Object.values(after).forEach(model => model.dispose()) }

function describe(root) {
  root.updateMatrixWorld(true)
  const surfaces = {}, instance = new Matrix4(), matrix = new Matrix4(), normalMatrix = new Matrix3(), p = new Vector3(), n = new Vector3()
  let calls = 0, triangles = 0
  root.traverse(mesh => {
    if (!(mesh instanceof Mesh)) return
    calls++
    const g = mesh.geometry, material = mesh.material.name
    const record = surfaces[material] ??= { vertices: 0, mean: [0, 0, 0], meanSquare: [0, 0, 0], normal: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }
    const count = g.index?.count ?? g.attributes.position.count
    for (let copy = 0; copy < (mesh instanceof InstancedMesh ? mesh.count : 1); copy++) {
      matrix.copy(mesh.matrixWorld)
      if (mesh instanceof InstancedMesh) { mesh.getMatrixAt(copy, instance); matrix.multiply(instance) }
      normalMatrix.getNormalMatrix(matrix)
      for (let vertex = 0; vertex < count; vertex++) {
        const index = g.index ? g.index.getX(vertex) : vertex
        p.fromBufferAttribute(g.attributes.position, index).applyMatrix4(matrix)
        n.fromBufferAttribute(g.attributes.normal, index).applyNormalMatrix(normalMatrix)
        for (let axis = 0; axis < 3; axis++) {
          const value = p.getComponent(axis)
          record.mean[axis] += value; record.meanSquare[axis] += value * value; record.normal[axis] += n.getComponent(axis)
          record.min[axis] = Math.min(record.min[axis], value); record.max[axis] = Math.max(record.max[axis], value)
        }
      }
      record.vertices += count; triangles += count / 3
    }
  })
  for (const record of Object.values(surfaces)) for (const field of ['mean', 'meanSquare', 'normal']) record[field] = record[field].map(value => value / record.vertices)
  return { calls, triangles, surfaces }
}
