import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, Group, Material,
  Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, PMREMGenerator, Raycaster,
  Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { createPose, evaluatePartTransform, validateParts } from '../animation/evaluatePartTransform'
import type { ProgressController } from '../animation/progressController'
import type { WatchPart } from '../types'
import { CameraRig } from './CameraRig'
import { highlightMaterial, makeGlass } from './materials'

type Hooks = {
  select: (partId: string | null) => void
  lost: () => void
  restored: () => void
  loading: (percent: number | null) => void
}

interface BoundPart {
  part: WatchPart
  object: Object3D
  meshes: Mesh[]
  label: HTMLSpanElement
}

export class WatchScene {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(33, 1, 0.1, 100)
  private controls: OrbitControls
  private rig: CameraRig
  private model: Group | null = null
  private environment: WebGLRenderTarget
  private bound: BoundPart[] = []
  private byId = new Map<string, BoundPart>()
  private pickable: Mesh[] = []
  private allMaterials = new Set<Material>()
  private resizeObserver: ResizeObserver
  private unsubscribe: () => void
  private abort = new AbortController()
  private frame = 0
  private disposed = false
  private contextLost = false
  private labels = true
  private selected: string | null = null
  private width = 1
  private height = 1
  private pointerStart = new Vector2()
  private maxPointerTravel = 0
  private pressedPointers = new Set<number>()
  private pose = createPose()
  private raycaster = new Raycaster()
  private labelRay = new Raycaster()
  private pointer = new Vector2()
  private worldAnchor = new Vector3()
  private projected = new Vector3()
  private direction = new Vector3()
  private frameDuration = 0
  private measuredFrames = 0
  private queuedAt = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private labelRoot: HTMLDivElement,
    private parts: WatchPart[],
    private progress: ProgressController,
    private hooks: Hooks,
  ) {
    validateParts(parts)
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.9
    this.renderer.setClearColor(new Color('#0e1620'), 0)

    const room = new RoomEnvironment()
    const pmrem = new PMREMGenerator(this.renderer)
    this.environment = pmrem.fromScene(room, 0.04)
    this.scene.environment = this.environment.texture
    this.scene.environmentIntensity = 1
    room.dispose()
    pmrem.dispose()

    this.scene.add(new AmbientLight('#c5d4e5', 0.45))
    const key = new DirectionalLight('#fff1d7', 2.2)
    key.position.set(-3, 6, 8)
    const fill = new DirectionalLight('#d8e9ff', 1.1)
    fill.position.set(4, 1, 3)
    const rim = new DirectionalLight('#f2cf92', 2.5)
    rim.position.set(1, 2, -5)
    this.scene.add(key, fill, rim)
    this.camera.position.set(5, 2.3, 8)
    this.controls = new OrbitControls(this.camera, canvas)
    this.rig = new CameraRig(this.camera, this.controls)
    this.controls.addEventListener('change', this.invalidate)
    this.unsubscribe = progress.subscribe(this.updatePose)
    this.resizeObserver = new ResizeObserver(this.resize)
    this.resizeObserver.observe(canvas.parentElement!)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('pointercancel', this.onPointerCancel)
    canvas.addEventListener('webglcontextlost', this.onContextLost)
    canvas.addEventListener('webglcontextrestored', this.onContextRestored)
    document.addEventListener('visibilitychange', this.onVisibility)
    this.resize()
    this.rig.frame(progress.getSnapshot().progress, this.width, this.height, true)
  }

  async load() {
    const timeout = window.setTimeout(() => this.abort.abort(), 30000)
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}models/pocket-watch.glb`, { signal: this.abort.signal, cache: 'no-cache' })
      if (!response.ok) throw new Error(`Не удалось загрузить модель: HTTP ${response.status}`)
      const size = Number(response.headers.get('content-length'))
      const reader = response.body?.getReader()
      let buffer: ArrayBuffer
      if (reader) {
        const chunks: Uint8Array[] = []
        let loaded = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          loaded += value.byteLength
          this.hooks.loading(size > 0 ? Math.round(loaded / size * 100) : null)
        }
        const bytes = new Uint8Array(loaded)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        buffer = bytes.buffer
      } else buffer = await response.arrayBuffer()

      const gltf = await new GLTFLoader().parseAsync(buffer, `${import.meta.env.BASE_URL}models/`)
      if (this.disposed) { this.disposeObject(gltf.scene); return }
      this.model = gltf.scene
      const glass = makeGlass()
      this.allMaterials.add(glass)
      for (const part of this.parts) {
        const object = this.model.getObjectByName(part.nodeName)
        if (!object) throw new Error(`В модели отсутствует деталь ${part.nodeName}`)
        const restValues = [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray()]
        const manifestValues = [...part.restPosition, ...part.restQuaternion, ...part.restScale]
        if (restValues.some((n, i) => Math.abs(n - manifestValues[i]) > 0.0001)) throw new Error(`Трансформации модели и манифеста расходятся: ${part.nodeName}`)
        const meshes: Mesh[] = []
        object.traverse(child => {
          if (!(child instanceof Mesh)) return
          child.userData.partId = part.id
          meshes.push(child)
          const originals = Array.isArray(child.material) ? child.material : [child.material]
          originals.forEach(material => this.allMaterials.add(material))
          if (part.nodeName === 'front_glass') {
            child.material = glass
            child.renderOrder = 2
          } else {
            const materials = originals.map(material => {
              const clone = material.clone()
              if (clone instanceof MeshStandardMaterial && clone.name === 'Charcoal dial printing') {
                clone.metalness = 0
                clone.roughness = 0.8
                clone.envMapIntensity = 0.2
              }
              this.allMaterials.add(clone)
              return clone
            })
            child.material = materials.length === 1 ? materials[0] : materials
            this.pickable.push(child)
          }
        })
        const label = document.createElement('span')
        label.className = 'part-label'
        label.textContent = part.title
        label.hidden = true
        this.labelRoot.append(label)
        const entry = { part, object, meshes, label }
        this.bound.push(entry)
        this.byId.set(part.id, entry)
      }
      this.scene.add(this.model)
      this.updatePose()
      this.renderer.compile(this.scene, this.camera)
      this.invalidate()
    } finally { window.clearTimeout(timeout) }
  }

  setLabels(value: boolean) { this.labels = value; this.invalidate() }

  select(id: string | null) {
    for (const key of [this.selected, id]) {
      if (!key) continue
      const entry = this.byId.get(key)
      entry?.meshes.forEach(mesh => {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        materials.forEach(material => { if (material instanceof MeshStandardMaterial) highlightMaterial(material, key === id) })
      })
    }
    this.selected = id
    this.invalidate()
  }

  resetCamera() {
    this.rig.frame(this.progress.getSnapshot().progress, this.width, this.height, true)
    this.invalidate()
  }

  private updatePose = () => {
    const p = this.progress.getSnapshot().progress
    for (const { part, object } of this.bound) {
      const pose = evaluatePartTransform(part, p, this.pose)
      object.position.fromArray(pose.position)
      object.quaternion.fromArray(pose.quaternion)
      object.scale.fromArray(pose.scale)
    }
    this.rig.frame(p, this.width, this.height)
    this.canvas.dataset.progress = p.toFixed(5)
    this.invalidate()
  }

  private resize = () => {
    const parent = this.canvas.parentElement!
    this.width = Math.max(1, parent.clientWidth)
    this.height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    this.rig.frame(this.progress.getSnapshot().progress, this.width, this.height)
    this.invalidate()
  }

  private invalidate = () => {
    if (!this.frame && !this.disposed && !this.contextLost && !document.hidden) {
      this.queuedAt = performance.now()
      this.frame = requestAnimationFrame(this.render)
    }
  }

  private render = () => {
    this.frame = 0
    if (this.disposed || this.contextLost) return
    const start = performance.now()
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
    this.frameDuration += Math.max(performance.now() - start, start - this.queuedAt)
    this.measuredFrames++
    if (this.measuredFrames === 4) {
      const average = this.frameDuration / 4
      const ratio = this.renderer.getPixelRatio()
      const nextRatio = average > 60 ? 0.75 : average > 32 ? 1 : ratio
      this.frameDuration = 0
      this.measuredFrames = 0
      if (nextRatio < ratio) {
        this.renderer.setPixelRatio(nextRatio)
        this.invalidate()
      }
    }
  }

  private updateLabels() {
    for (const { label } of this.bound) label.hidden = true
    if (!this.labels || !this.model) return
    const p = this.progress.getSnapshot().progress
    const mobile = this.width < 560
    const candidates = this.selected ? [this.byId.get(this.selected)!] : this.bound.filter(({ part }) =>
      (p < 0.35 ? ['front_bezel', 'dial_face', 'crown', 'bow'] : p < 0.65 ? ['dial_face', 'case_body', 'movement_mainplate', 'back_cover'] : ['gear_center', 'balance_assembly', 'mainspring_barrel', 'movement_bridge_upper']).includes(part.nodeName))
    if (mobile && !this.selected) return
    let count = 0
    const occupied: { x: number; y: number; width: number }[] = []
    this.scene.updateMatrixWorld(true)
    for (const entry of candidates) {
      if (!entry || count >= (mobile ? 1 : 3)) break
      const { part, object, label } = entry
      this.worldAnchor.fromArray(part.labelAnchor).applyMatrix4(object.matrixWorld)
      this.projected.copy(this.worldAnchor).project(this.camera)
      if (this.projected.z < -1 || this.projected.z > 1) continue
      const x = (this.projected.x * 0.5 + 0.5) * this.width
      const y = (-this.projected.y * 0.5 + 0.5) * this.height
      const labelWidth = Math.min(215, part.title.length * 7.2 + 28)
      if (x < 24 || x + labelWidth > this.width - 12 || y < 30 || y > this.height - 45) continue
      if (occupied.some(other => Math.abs(other.y - y) < 38 && x < other.x + other.width + 16 && x + labelWidth + 16 > other.x)) continue
      this.direction.copy(this.worldAnchor).sub(this.camera.position)
      const distance = this.direction.length()
      this.labelRay.set(this.camera.position, this.direction.normalize())
      const hit = this.labelRay.intersectObjects(this.pickable, false)[0]
      if (hit && hit.distance < distance - 0.12 && hit.object.userData.partId !== part.id) continue
      label.style.transform = `translate(${x}px, ${y}px)`
      label.dataset.selected = String(part.id === this.selected)
      label.hidden = false
      occupied.push({ x, y, width: labelWidth })
      count++
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    this.pointerStart.set(event.clientX, event.clientY)
    this.pressedPointers.add(event.pointerId)
    this.maxPointerTravel = this.pressedPointers.size > 1 ? 100 : 0
  }
  private onPointerMove = (event: PointerEvent) => {
    if (this.pressedPointers.size) this.maxPointerTravel = Math.max(this.maxPointerTravel, Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y))
  }
  private onPointerCancel = (event: PointerEvent) => { this.pressedPointers.delete(event.pointerId); this.maxPointerTravel = 100 }
  private onPointerUp = (event: PointerEvent) => {
    this.pressedPointers.delete(event.pointerId)
    if (this.maxPointerTravel > 6 || this.pressedPointers.size || event.button !== 0 || !this.model) return
    const rect = this.canvas.getBoundingClientRect()
    this.pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects(this.pickable, false)[0]
    const id = hit?.object.userData.partId as string | undefined
    if (id && this.byId.get(id)?.part.selectable) this.hooks.select(id === this.selected ? null : id)
    else this.hooks.select(null)
  }

  private onVisibility = () => {
    if (document.hidden) {
      this.progress.pause()
      cancelAnimationFrame(this.frame)
      this.frame = 0
    } else this.invalidate()
  }
  private onContextLost = (event: Event) => {
    event.preventDefault()
    this.contextLost = true
    this.progress.pause()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.hooks.lost()
  }
  private onContextRestored = () => { if (!this.disposed) this.hooks.restored() }

  private disposeObject(object: Object3D) {
    object.traverse(child => {
      if (!(child instanceof Mesh)) return
      child.geometry.dispose()
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach(material => material.dispose())
    })
  }

  dispose() {
    this.disposed = true
    this.abort.abort()
    cancelAnimationFrame(this.frame)
    this.unsubscribe()
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.rig.dispose()
    this.controls.dispose()
    if (this.model) this.disposeObject(this.model)
    this.allMaterials.forEach(material => material.dispose())
    this.environment.dispose()
    this.renderer.dispose()
    this.labelRoot.replaceChildren()
  }
}
