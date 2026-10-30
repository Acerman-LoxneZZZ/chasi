import {
  BoxGeometry, BufferGeometry, CapsuleGeometry, CatmullRomCurve3, CylinderGeometry,
  ExtrudeGeometry, Float32BufferAttribute, Group, InstancedMesh, LatheGeometry,
  Material, Matrix4, Mesh, MeshStandardMaterial, Object3D, Path, Quaternion, Shape,
  SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3,
} from 'three'

export type DetailSceneKind = 'balance' | 'crown' | 'geartrain'

export interface DetailModel {
  root: Group
  radius: number
  update: (progress: number, timeSeconds: number, reduced: boolean) => void
  dispose: () => void
}

const TAU = Math.PI * 2
const clamp = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
const ease = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }

function materials() {
  return {
    brass: new MeshStandardMaterial({ name: 'KARpOV detail satin brass', color: '#b58b4d', metalness: .92, roughness: .29 }),
    edge: new MeshStandardMaterial({ name: 'KARpOV detail polished edges', color: '#d7b371', metalness: .98, roughness: .16 }),
    steel: new MeshStandardMaterial({ name: 'KARpOV detail machined steel', color: '#c7d0d5', metalness: .94, roughness: .22 }),
    blue: new MeshStandardMaterial({ name: 'KARpOV detail blued steel', color: '#183a56', metalness: .86, roughness: .24 }),
    jewel: new MeshStandardMaterial({ name: 'KARpOV detail ruby', color: '#a41d4a', metalness: .27, roughness: .17 }),
    dark: new MeshStandardMaterial({ name: 'KARpOV detail recessed engraving', color: '#263544', metalness: .7, roughness: .4 }),
  }
}

function addMesh(parent: Object3D, geometry: BufferGeometry, material: Material, position: [number, number, number] = [0, 0, 0]) {
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  parent.add(mesh)
  return mesh
}

function cylinderZ(radius: number, depth: number, segments = 32) {
  const geometry = new CylinderGeometry(radius, radius, depth, segments)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function ringZ(profile: [number, number][], segments = 80) {
  const geometry = new LatheGeometry(profile.map(([radius, z]) => new Vector2(radius, z)), segments)
  geometry.rotateX(Math.PI / 2)
  return geometry
}

function radialInstances(parent: Object3D, geometry: BufferGeometry, material: Material, count: number, radius: number, z: number, phase = 0) {
  const mesh = new InstancedMesh(geometry, material, count)
  const matrix = new Matrix4(), rotation = new Quaternion(), position = new Vector3(), scale = new Vector3(1, 1, 1)
  for (let index = 0; index < count; index++) {
    const angle = index / count * TAU + phase
    position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, z)
    rotation.setFromAxisAngle(new Vector3(0, 0, 1), angle)
    matrix.compose(position, rotation, scale)
    mesh.setMatrixAt(index, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  parent.add(mesh)
  return mesh
}

/** Thin, closed rectangular steel ribbon. Unlike a tube it reads as a real spring. */
function spiralRibbon(inner: number, outer: number, turns: number, width: number, thickness: number, segments = 352) {
  const positions: number[] = [], indices: number[] = []
  for (let index = 0; index <= segments; index++) {
    const u = index / segments, angle = u * turns * TAU, radius = inner + (outer - inner) * u
    const c = Math.cos(angle), s = Math.sin(angle)
    for (const [side, z] of [[-1, -thickness / 2], [1, -thickness / 2], [1, thickness / 2], [-1, thickness / 2]]) {
      positions.push(c * (radius + side * width / 2), s * (radius + side * width / 2), z)
    }
    if (index < segments) for (let side = 0; side < 4; side++) {
      const a = index * 4 + side, b = index * 4 + (side + 1) % 4
      indices.push(a, b + 4, b, a, a + 4, b + 4)
    }
  }
  indices.push(0, 1, 2, 0, 2, 3)
  const end = segments * 4
  indices.push(end, end + 2, end + 1, end, end + 3, end + 2)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function disposeModel(root: Group, ownedMaterials: Material[]) {
  const geometries = new Set<BufferGeometry>(), resources = new Set<Material>(ownedMaterials)
  root.traverse(object => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material)
    if (object instanceof InstancedMesh) object.dispose()
  })
  geometries.forEach(geometry => geometry.dispose())
  resources.forEach(material => material.dispose())
  root.clear()
}

function createBalance(): DetailModel {
  const root = new Group(); root.name = 'KARpOV balance and hairspring'
  const m = materials()
  const wheel = new Group(), spring = new Group(), bridge = new Group()
  wheel.position.y = -.15
  spring.position.y = -.15
  bridge.position.y = -.15
  root.add(wheel, spring, bridge)
  addMesh(wheel, ringZ([[1.4, -.045], [1.44, -.11], [1.62, -.11], [1.69, -.055], [1.69, .055], [1.62, .11], [1.44, .11], [1.4, .045], [1.4, -.045]], 96), m.brass)
  addMesh(wheel, new TorusGeometry(1.645, .027, 8, 96), m.edge, [0, 0, .098])
  radialInstances(wheel, new BoxGeometry(1.19, .105, .12), m.brass, 6, .825, 0)
  addMesh(wheel, cylinderZ(.25, .20, 40), m.edge)
  radialInstances(wheel, cylinderZ(.066, .095, 12), m.steel, 12, 1.565, .15, Math.PI / 12)
  radialInstances(wheel, new BoxGeometry(.07, .012, .008), m.dark, 12, 1.565, .202, Math.PI / 12)
  addMesh(wheel, cylinderZ(.07, .78, 24), m.steel, [0, 0, .19])
  addMesh(spring, spiralRibbon(.21, 1.185, 6.1, .025, .034, 384), m.blue)
  addMesh(spring, new TorusGeometry(.16, .045, 10, 32), m.steel)

  const bridgeShape = new Shape()
  bridgeShape.moveTo(-1.58, -.12)
  bridgeShape.quadraticCurveTo(-1.68, 0, -1.58, .12)
  bridgeShape.lineTo(-.28, .20)
  bridgeShape.quadraticCurveTo(0, .33, .28, .20)
  bridgeShape.lineTo(1.58, .12)
  bridgeShape.quadraticCurveTo(1.68, 0, 1.58, -.12)
  bridgeShape.lineTo(.28, -.20)
  bridgeShape.quadraticCurveTo(0, -.33, -.28, -.20)
  bridgeShape.closePath()
  for (const x of [-.82, .82]) {
    const hole = new Path(); hole.absellipse(x, 0, .32, .065, 0, TAU, true)
    bridgeShape.holes.push(hole)
  }
  const bridgeGeometry = new ExtrudeGeometry(bridgeShape, { depth: .10, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .025, bevelThickness: .025, curveSegments: 16 })
  addMesh(bridge, bridgeGeometry, m.brass)
  addMesh(bridge, new TorusGeometry(.18, .035, 10, 36), m.steel, [0, 0, .13])
  addMesh(bridge, new TorusGeometry(.118, .037, 10, 36), m.jewel, [0, 0, .15])
  addMesh(bridge, cylinderZ(.045, .025, 20), m.steel, [0, 0, .17])
  const screw = cylinderZ(.092, .05, 20), screwSlot = new BoxGeometry(.105, .014, .008)
  for (const x of [-1.45, 1.45]) {
    addMesh(bridge, screw, m.blue, [x, 0, .13])
    addMesh(bridge, screwSlot, m.steel, [x, 0, .159])
  }

  return {
    root, radius: 2.05,
    update(progress, timeSeconds, reduced) {
      const p = ease(progress), oscillation = reduced ? 0 : Math.sin(timeSeconds * 3.3) * .20
      wheel.rotation.z = oscillation + p * .17
      spring.rotation.z = oscillation * .22 + p * .17
      const breath = 1 + oscillation * .055
      spring.scale.set(breath, breath, 1)
      spring.position.z = .29 + p * .24
      bridge.position.z = .48 + p * .43
      bridge.rotation.z = -.14 + p * .09
      wheel.position.z = -.05 - p * .12
    },
    dispose: () => disposeModel(root, Object.values(m)),
  }
}

function createCrown(): DetailModel {
  const root = new Group(); root.name = 'KARpOV fluted crown and winding shaft'
  const m = materials()
  const head = new Group(), shaft = new Group(), bow = new Group(), collar = new Group()
  root.add(head, shaft, bow, collar)
  const crownProfile: [number, number][] = [[0, -.46], [.54, -.46], [.74, -.40], [.88, -.25], [.953, 0], [.91, .23], [.74, .40], [.48, .47], [0, .47]]
  addMesh(head, new LatheGeometry(crownProfile.map(([r, y]) => new Vector2(r, y)), 96), m.brass)
  const fluteCurve = new CatmullRomCurve3([new Vector3(.82, -.34, 0), new Vector3(.918, -.20, 0), new Vector3(.976, 0, 0), new Vector3(.935, .20, 0), new Vector3(.82, .34, 0)])
  const flutes = new InstancedMesh(new TubeGeometry(fluteCurve, 10, .026, 6, false), m.edge, 48)
  const matrix = new Matrix4()
  for (let index = 0; index < 48; index++) { matrix.makeRotationY(index / 48 * TAU); flutes.setMatrixAt(index, matrix) }
  flutes.instanceMatrix.needsUpdate = true
  head.add(flutes)
  addMesh(head, new CylinderGeometry(.46, .54, .055, 48), m.edge, [0, .468, 0])
  addMesh(head, new CylinderGeometry(.345, .345, .016, 48), m.blue, [0, .505, 0])
  const mark = new Group()
  mark.add(new Mesh(new BoxGeometry(.035, .013, .30), m.edge))
  mark.children[0].position.x = -.10
  for (const sign of [-1, 1]) {
    const leg = addMesh(mark, new BoxGeometry(.035, .013, .20), m.edge, [.025, 0, sign * .071])
    leg.rotation.y = sign * -.63
  }
  mark.position.y = .52
  head.add(mark)
  addMesh(head, new CylinderGeometry(.56, .64, .075, 64), m.edge, [0, -.465, 0])
  addMesh(collar, new CylinderGeometry(.33, .36, .17, 48), m.steel)
  addMesh(collar, new TorusGeometry(.33, .032, 10, 48), m.edge).rotation.x = Math.PI / 2
  addMesh(shaft, new CylinderGeometry(.125, .125, 1.22, 32), m.steel)
  addMesh(shaft, new CylinderGeometry(.085, .12, .25, 24), m.blue, [0, -.71, 0])
  const threadPoints: Vector3[] = []
  for (let index = 0; index <= 128; index++) {
    const angle = index / 128 * TAU * 5
    threadPoints.push(new Vector3(Math.cos(angle) * .131, -.45 + index / 128 * .61, Math.sin(angle) * .131))
  }
  addMesh(shaft, new TubeGeometry(new CatmullRomCurve3(threadPoints), 128, .017, 5, false), m.edge)
  addMesh(bow, new TorusGeometry(.79, .085, 10, 80), m.edge)
  const pivotGeometry = new CylinderGeometry(.115, .115, .17, 24)
  pivotGeometry.rotateZ(Math.PI / 2)
  for (const x of [-.68, .68]) addMesh(root, pivotGeometry, m.steel, [x, .58, -.075])

  return {
    root, radius: 2.5,
    update(progress, timeSeconds, reduced) {
      const p = ease(progress), winding = p * .8 + (reduced ? 0 : Math.sin(timeSeconds * .55) * .18)
      head.position.y = .05 + p * .12
      head.rotation.y = winding
      shaft.position.y = -.98 - p * .25
      shaft.rotation.y = winding
      collar.position.y = -.55 - p * .11
      bow.position.set(0, 1.15 + p * .22, -.16)
      bow.rotation.y = -.12 + p * .20
    },
    dispose: () => disposeModel(root, Object.values(m)),
  }
}

function createGeartrain(): DetailModel {
  const root = new Group(); root.name = 'KARpOV three-wheel train'
  const m = materials()
  const gears: Group[] = []
  const anchors: [number, number, number][] = [[-1.02, .45, 0], [.52, .45, .03], [1.34, -.57, -.035]]
  const depths = [.20, .55, .36] as const
  const radii = [.93, .496, .744], counts = [60, 32, 48], spokes = [6, 4, 5]
  const toothShape = new Shape()
  toothShape.moveTo(-.065, -.038); toothShape.lineTo(.065, -.026); toothShape.lineTo(.065, .026); toothShape.lineTo(-.065, .038); toothShape.closePath()
  const tooth = new ExtrudeGeometry(toothShape, { depth: .14, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 1, steps: 1 })
  tooth.translate(0, 0, -.07)
  const axle = cylinderZ(.054, .63, 24)
  const ruby = new TorusGeometry(.105, .028, 8, 28)
  const bushing = new TorusGeometry(.143, .028, 8, 32)
  const slot = new BoxGeometry(.082, .013, .007)
  for (let index = 0; index < 3; index++) {
    const r = radii[index], gear = new Group()
    gear.position.set(...anchors[index]); gears.push(gear); root.add(gear)
    addMesh(gear, ringZ([[r * .71, -.055], [r * .76, -.095], [r - .064, -.095], [r - .054, -.045], [r - .054, .045], [r - .064, .095], [r * .76, .095], [r * .71, .055], [r * .71, -.055]], 64), m.brass)
    addMesh(gear, new TorusGeometry(r - .089, .02, 8, 64), m.edge, [0, 0, .092])
    radialInstances(gear, tooth, m.brass, counts[index], r, 0)
    radialInstances(gear, new BoxGeometry(r * .63, .082, .12), m.brass, spokes[index], r * .46, 0)
    addMesh(gear, cylinderZ(.17, .23, 32), m.edge)
    addMesh(gear, axle, m.steel, [0, 0, .12])
    addMesh(gear, bushing, m.steel, [0, 0, .165])
    addMesh(gear, ruby, m.jewel, [0, 0, .185])
    addMesh(gear, cylinderZ(.06, .036, 20), m.blue, [0, 0, .22])
    addMesh(gear, slot, m.steel, [0, 0, .242])
  }
  const support = new Group(); root.add(support)
  const up = new Vector3(0, 1, 0)
  for (let index = 0; index < 2; index++) {
    const a = new Vector3(...anchors[index]), b = new Vector3(...anchors[index + 1])
    const direction = b.clone().sub(a), rod = addMesh(support, new CapsuleGeometry(.075, direction.length() - .15, 4, 12), m.steel)
    rod.quaternion.setFromUnitVectors(up, direction.normalize())
    rod.position.copy(a).add(b).multiplyScalar(.5); rod.position.z = -.27
  }
  for (const [x, y] of anchors) {
    addMesh(support, cylinderZ(.18, .10, 28), m.blue, [x, y, -.285])
    addMesh(support, new SphereGeometry(.065, 12, 8), m.edge, [x, y, -.37])
  }

  return {
    root, radius: 2.7,
    update(progress, timeSeconds, reduced) {
      const p = ease(progress)
      // Sixteen turns of the first wheel close a full period for 60:32:48.
      const phase = p * .9 + (reduced ? 0 : timeSeconds % (TAU * 16 / .28) * .28)
      for (let index = 0; index < gears.length; index++) {
        const [x, y, z] = anchors[index], gear = gears[index]
        gear.position.set(x * (1 + p * .075), y * (1 + p * .075), z + p * depths[index])
        gear.rotation.z = index === 0 ? phase : index === 1 ? -phase * 60 / 32 + Math.PI / 32 : phase * 60 / 48 + Math.PI / 48
      }
      support.position.z = -p * .16
    },
    dispose: () => disposeModel(root, Object.values(m)),
  }
}

/** Original, code-native mechanical studies; no network assets or GLB clones. */
export function createDetailModels(): Record<DetailSceneKind, DetailModel> {
  const models = { balance: createBalance(), crown: createCrown(), geartrain: createGeartrain() }
  for (const model of Object.values(models)) model.update(.35, 0, true)
  return models
}
