import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = path.join(root, 'public/models/pocket-watch.glb')
const manifestPath = path.join(root, 'src/data/watch-parts.json')
const data = readFileSync(modelPath)
const parts = JSON.parse(readFileSync(manifestPath, 'utf8'))
assert.equal(data.readUInt32LE(0), 0x46546c67, 'Expected a binary glTF file')
assert.equal(data.readUInt32LE(4), 2, 'Expected glTF 2.0')
assert.equal(data.readUInt32LE(8), data.length, 'Truncated GLB')
assert.equal(data.readUInt32LE(16), 0x4e4f534a, 'Missing glTF JSON chunk')
const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8').trim())
assert(Array.isArray(parts) && parts.length >= 24, 'At least 24 independent parts are required')
assert.equal(new Set(parts.map(part => part.id)).size, parts.length, 'Duplicate part IDs')
assert.equal(new Set(parts.map(part => part.nodeName)).size, parts.length, 'Duplicate carrier names')
const nodes = gltf.nodes || []
const byName = new Map(nodes.map((node, index) => [node.name, { node, index }]))
const watchRoot = byName.get('watch_root')
assert(watchRoot, 'Missing watch_root')
const directChildren = new Set(watchRoot.node.children)
const approximate = (actual, expected, name) => {
  assert.equal(actual.length, expected.length, `${name}: mismatched vector length`)
  actual.forEach((value, index) => assert(Math.abs(value - expected[index]) < 0.0001, `${name}[${index}]: ${value} vs ${expected[index]}`))
}

for (const part of parts) {
  const entry = byName.get(part.nodeName)
  assert(entry, `Missing glTF node ${part.nodeName}`)
  assert(directChildren.has(entry.index), `${part.nodeName} must be a direct child of watch_root`)
  assert(part.title && part.description && part.materialLabel, `${part.nodeName}: missing explanatory text`)
  assert(['case', 'dial', 'movement', 'fastener'].includes(part.category), `${part.nodeName}: invalid category`)
  assert.equal(typeof part.selectable, 'boolean', `${part.nodeName}: selectable must be boolean`)
  for (const key of ['restPosition', 'explodedOffset', 'restScale', 'labelAnchor']) assert(part[key]?.length === 3 && part[key].every(Number.isFinite), `${part.nodeName}: invalid ${key}`)
  for (const key of ['restQuaternion', 'explodedQuaternion']) {
    assert(part[key]?.length === 4 && part[key].every(Number.isFinite), `${part.nodeName}: invalid ${key}`)
    assert(Math.abs(Math.hypot(...part[key]) - 1) < 0.0001, `${part.nodeName}: ${key} is not normalized`)
  }
  assert(part.restScale.every(value => value > 0), `${part.nodeName}: nonpositive scale`)
  assert(Number.isFinite(part.start) && Number.isFinite(part.end) && part.start >= 0 && part.end <= 1 && part.end >= part.start, `${part.nodeName}: invalid interval`)
  assert(part.end > part.start || part.explodedOffset.every(value => value === 0), `${part.nodeName}: moving part has no interval`)
  assert(!entry.node.matrix, `${part.nodeName}: carrier should use exported TRS, not a matrix`)
  approximate(entry.node.translation || [0, 0, 0], part.restPosition, `${part.nodeName} position`)
  approximate(entry.node.rotation || [0, 0, 0, 1], part.restQuaternion, `${part.nodeName} quaternion`)
  approximate(entry.node.scale || [1, 1, 1], part.restScale, `${part.nodeName} scale`)
  assert(entry.node.children?.length || entry.node.mesh !== undefined, `${part.nodeName}: empty carrier`)
}

for (const required of ['case_body', 'front_bezel', 'front_glass', 'dial_face', 'hand_hour', 'hand_minute', 'movement_mainplate', 'mainspring_barrel', 'crown', 'bow', 'back_cover']) assert(byName.has(required), `Missing essential watch part ${required}`)
assert(!gltf.cameras?.length, 'Development cameras must not be exported')
assert(!gltf.extensions?.KHR_lights_punctual, 'Development lights must not be exported')
for (const resource of [...(gltf.buffers || []), ...(gltf.images || [])]) assert(!resource.uri || resource.uri.startsWith('data:'), `External resource: ${resource.uri}`)

let triangles = 0, primitives = 0, vertices = 0
for (const mesh of gltf.meshes || []) for (const primitive of mesh.primitives) {
  primitives++
  const positions = gltf.accessors[primitive.attributes.POSITION]
  vertices += positions.count
  if (primitive.mode === undefined || primitive.mode === 4) triangles += (primitive.indices === undefined ? positions.count : gltf.accessors[primitive.indices].count) / 3
}
assert(triangles > 1000, 'Unexpectedly empty watch geometry')
const report = { valid: true, model: 'public/models/pocket-watch.glb', sizeBytes: data.length, parts: parts.length, gltfNodes: nodes.length, meshes: gltf.meshes.length, primitives, vertices, triangles, externalResources: 0 }
console.log(JSON.stringify(report, null, 2))
