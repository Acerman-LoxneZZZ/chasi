import { Color, Group, Material, Matrix4, Mesh, MeshStandardMaterial, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import rawParts from '../data/watch-parts.json'
import { createPose, evaluatePartTransform } from '../animation/evaluatePartTransform'
import { evaluateFinale } from '../animation/finaleTimeline'
import type { WatchFinish } from '../data/collection'
import type { WatchPart } from '../types'
import type { DetailModel } from './detailModels'
import { Engraving } from './Engraving'
import { makeGlass } from './materials'

const parts = rawParts as WatchPart[]
const ORIGIN = new Vector3(), UP = new Vector3(0, 1, 0)
export type WatchDetailKind = 'engraving' | 'assembly'

/** One lazy GLB instance for both lower watch views, using the shared renderer. */
export class PersonalWatchModel implements DetailModel {
  radius = 4
  private bound: { part: WatchPart; object: Group }[] = []
  private materials = new Set<Material>()
  private finishes = new Map<MeshStandardMaterial, { color: Color; roughness: number }>()
  private cache: { mesh: Mesh; local: Vector3; world: Vector3 }[] = []
  private pose = createPose()
  private rotation = new Quaternion()
  private inverse = new Quaternion()
  private matrix = new Matrix4()
  private direction = new Vector3()
  private point = new Vector3()
  private low = new Vector3()
  private high = new Vector3()
  private center = new Vector3()
  private inscription: Engraving
  private kind: WatchDetailKind = 'engraving'
  private progress = .5
  private reduced = false
  private mobile = false
  visualPose = 0
  constructor(readonly root: Group) {
    for (const part of parts) {
      const object = root.getObjectByName(part.nodeName) as Group | undefined
      if (!object) throw new Error(`Missing watch carrier: ${part.nodeName}`)
      const exported = [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]
      const rest = [...part.restPosition, ...part.restQuaternion, ...part.restScale]
      if (exported.some((value, index) => Math.abs(value - rest[index]) > .0001)) throw new Error(`Rest TRS mismatch: ${part.nodeName}`)
      this.bound.push({ part, object })
      object.traverse(child => {
        if (!(child instanceof Mesh)) return
        const originals = Array.isArray(child.material) ? child.material : [child.material]
        originals.forEach(material => this.materials.add(material))
        if (part.nodeName === 'front_glass') {
          child.material = makeGlass()
          child.renderOrder = 2
        } else {
          const copied = originals.map(material => {
            const clone = material.clone()
            if (clone instanceof MeshStandardMaterial) {
              if (clone.name.includes('Charcoal dial printing')) { clone.metalness = 0; clone.roughness = .8; clone.envMapIntensity = .2 }
              if (part.category === 'case' && /Satin brass|Polished brass edges|Warm aged case/.test(clone.name)) this.finishes.set(clone, { color: clone.color.clone(), roughness: clone.roughness })
            }
            this.materials.add(clone)
            return clone
          })
          child.material = copied.length === 1 ? copied[0] : copied
        }
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) this.materials.add(material)
        child.geometry.computeBoundingBox()
        const box = child.geometry.boundingBox!
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) this.cache.push({ mesh: child, local: new Vector3(x, y, z), world: new Vector3() })
      })
    }
    this.inscription = new Engraving(root.getObjectByName('back_cover')!)
  }
  setPersonalization(finish: WatchFinish, engraving: string) {
    for (const [material, rest] of this.finishes) {
      material.color.copy(rest.color)
      material.roughness = rest.roughness
      if (finish !== 'brass') { material.color.set(finish === 'steel' ? '#bfc6cc' : '#424c59'); material.roughness = finish === 'steel' ? .3 : .32 }
    }
    this.inscription.setFinish(finish)
    this.inscription.setText(engraving)
  }
  configure(kind: WatchDetailKind, width: number) { this.kind = kind; this.mobile = width < 700 }
  update(progress: number, _time: number, reduced: boolean) {
    this.progress = progress
    this.reduced = reduced
    this.visualPose = this.kind === 'assembly' ? evaluateFinale(progress, reduced).pose : 0
    for (const { part, object } of this.bound) {
      const pose = evaluatePartTransform(part, this.visualPose, this.pose, this.mobile)
      object.position.fromArray(pose.position)
      object.quaternion.fromArray(pose.quaternion)
      object.scale.fromArray(pose.scale)
    }
    this.root.updateMatrixWorld(true)
    for (const entry of this.cache) entry.world.copy(entry.local).applyMatrix4(entry.mesh.matrixWorld)
  }
  frameCamera(camera: PerspectiveCamera, width: number, height: number) {
    const travel = evaluateFinale(this.progress, this.reduced).camera
    const yaw = this.kind === 'engraving' ? Math.PI + (this.reduced ? 0 : (this.progress - .5) * .24) : (36 - 48 * travel) * Math.PI / 180
    const pitch = this.kind === 'engraving' ? .055 : (.16 - travel * .055)
    const fill = this.kind === 'engraving' ? .88 : .90 - travel * .18
    camera.fov = 30
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    this.matrix.lookAt(this.direction, ORIGIN, UP)
    this.rotation.setFromRotationMatrix(this.matrix)
    this.inverse.copy(this.rotation).invert()
    this.low.set(Infinity, Infinity, Infinity); this.high.set(-Infinity, -Infinity, -Infinity)
    for (const entry of this.cache) { this.point.copy(entry.world).applyQuaternion(this.inverse); this.low.min(this.point); this.high.max(this.point) }
    this.center.copy(this.low).add(this.high).multiplyScalar(.5)
    const tanY = Math.tan(camera.fov * Math.PI / 360) * fill, tanX = tanY * camera.aspect
    let distance = 0
    for (const entry of this.cache) {
      this.point.copy(entry.world).applyQuaternion(this.inverse).sub(this.center)
      distance = Math.max(distance, this.point.z + Math.max(Math.abs(this.point.x) / tanX, Math.abs(this.point.y) / tanY))
    }
    this.center.applyQuaternion(this.rotation)
    if (this.kind === 'assembly') this.center.y -= travel * .18
    camera.position.copy(this.direction).multiplyScalar(distance).add(this.center)
    camera.quaternion.copy(this.rotation)
    camera.updateMatrixWorld()
  }
  dispose() {
    this.inscription.dispose()
    const geometries = new Set<Mesh['geometry']>()
    this.root.traverse(child => { if (child instanceof Mesh) geometries.add(child.geometry) })
    geometries.forEach(geometry => geometry.dispose())
    this.materials.forEach(material => material.dispose())
    this.root.removeFromParent()
    this.root.clear()
  }
}

export async function loadPersonalWatch(signal: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}models/pocket-watch.glb`, { signal, cache: 'force-cache' })
  if (!response.ok) throw new Error(`Watch HTTP ${response.status}`)
  const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), `${import.meta.env.BASE_URL}models/`)
  await document.fonts.ready
  const model = new PersonalWatchModel(gltf.scene)
  if (signal.aborted) { model.dispose(); throw new DOMException('Aborted', 'AbortError') }
  return model
}
