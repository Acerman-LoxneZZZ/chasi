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
import type { ViewMode } from '../animation/scrollCoordinator'
import { shortFunctions, storyStageIndex, storyStages } from '../data/story'
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
  leader: SVGPathElement
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
  private mode: ViewMode = 'story'
  private initialFrame = true
  private boundsPoints: Vector3[] = []
  private boundsCache: { mesh: Mesh; local: Vector3; world: Vector3 }[] = []
  private leaders: SVGSVGElement
  private renderedFrames = 0

  constructor(
    private canvas: HTMLCanvasElement,
    private labelRoot: HTMLDivElement,
    private parts: WatchPart[],
    private progress: ProgressController,
    private hooks: Hooks,
    mode: ViewMode = 'story',
    reducedMotion = false,
  ) {
    validateParts(parts)
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.84
    this.renderer.setClearColor(new Color('#0e1620'), 0)

    const room = new RoomEnvironment()
    const pmrem = new PMREMGenerator(this.renderer)
    this.environment = pmrem.fromScene(room, 0.04)
    this.scene.environment = this.environment.texture
    this.scene.environmentIntensity = .85
    room.dispose()
    pmrem.dispose()

    this.scene.add(new AmbientLight('#c5d4e5', .35))
    const key = new DirectionalLight('#fff1d7', 1.9)
    key.position.set(-3, 6, 8)
    const fill = new DirectionalLight('#d8e9ff', 1.1)
    fill.position.set(4, 1, 3)
    const rim = new DirectionalLight('#f2cf92', 1.8)
    rim.position.set(1, 2, -5)
    this.scene.add(key, fill, rim)
    this.camera.position.set(5, 2.3, 8)
    this.controls = new OrbitControls(this.camera, canvas)
    this.rig = new CameraRig(this.camera, this.controls)
    this.mode = mode
    this.rig.setMode(mode, reducedMotion, canvas)
    this.leaders = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.leaders.classList.add('scene-leaders')
    this.leaders.setAttribute('aria-hidden', 'true')
    this.labelRoot.append(this.leaders)
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
          child.geometry.computeBoundingBox()
          const box = child.geometry.boundingBox!
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            const world = new Vector3()
            this.boundsPoints.push(world)
            this.boundsCache.push({ mesh: child, local: new Vector3(x, y, z), world })
          }
          const originals = Array.isArray(child.material) ? child.material : [child.material]
          originals.forEach(material => this.allMaterials.add(material))
          if (part.nodeName === 'front_glass') {
            child.material = glass
            child.renderOrder = 2
          } else {
            const materials = originals.map(material => {
              const clone = material.clone()
              if (clone instanceof MeshStandardMaterial && clone.name.includes('Charcoal dial printing')) {
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
        const title = document.createElement('strong')
        title.textContent = part.title
        const description = document.createElement('span')
        description.textContent = shortFunctions[part.nodeName] ?? part.description.split('. ')[0] + '.'
        label.append(title, description)
        label.dataset.node = part.nodeName
        label.hidden = true
        this.labelRoot.append(label)
        const leader = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        leader.style.display = 'none'
        this.leaders.append(leader)
        const entry = { part, object, meshes, label, leader }
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

  setMode(mode: ViewMode, reducedMotion: boolean) {
    const changed = mode !== this.mode
    this.mode = mode
    this.rig.setMode(mode, reducedMotion, this.canvas)
    this.canvas.dataset.mode = mode
    if (!changed || mode === 'story') this.rig.frame(this.progress.getSnapshot().progress, this.width, this.height, this.boundsPoints)
    this.invalidate()
  }

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
    this.rig.frame(this.progress.getSnapshot().progress, this.width, this.height, this.boundsPoints, true)
    this.invalidate()
  }

  private updatePose = () => {
    const p = this.progress.getSnapshot().progress
    for (const { part, object } of this.bound) {
      const pose = evaluatePartTransform(part, p, this.pose, this.width < 700)
      object.position.fromArray(pose.position)
      object.quaternion.fromArray(pose.quaternion)
      object.scale.fromArray(pose.scale)
    }
    this.model?.updateMatrixWorld(true)
    for (const entry of this.boundsCache) entry.world.copy(entry.local).applyMatrix4(entry.mesh.matrixWorld)
    this.rig.frame(p, this.width, this.height, this.boundsPoints, this.initialFrame)
    if (this.model) this.initialFrame = false
    this.canvas.dataset.progress = p.toFixed(5)
    this.canvas.dataset.mode = this.mode
    this.invalidate()
  }

  private resize = () => {
    const parent = this.canvas.parentElement!
    this.width = Math.max(1, parent.clientWidth)
    this.height = Math.max(1, parent.clientHeight)
    this.renderer.setSize(this.width, this.height, false)
    this.leaders.setAttribute('viewBox', `0 0 ${this.width} ${this.height}`)
    this.updatePose()
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
    const moving = this.rig.tick(start)
    this.renderer.render(this.scene, this.camera)
    this.updateLabels()
    this.canvas.dataset.drawCalls = String(this.renderer.info.render.calls)
    this.canvas.dataset.triangles = String(this.renderer.info.render.triangles)
    this.canvas.dataset.frames = String(++this.renderedFrames)
    this.canvas.dataset.dpr = String(this.renderer.getPixelRatio())
    this.canvas.dataset.renderedProgress = this.progress.getSnapshot().progress.toFixed(5)
    this.canvas.dataset.camera = JSON.stringify({ position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray(), target: this.controls.target.toArray() })
    if (moving) this.invalidate()
    this.frameDuration += Math.max(performance.now() - start, start - this.queuedAt)
    this.measuredFrames++
    if (this.measuredFrames === 4) {
      const average = this.frameDuration / 4
      const ratio = this.renderer.getPixelRatio()
      // Keep thin hands and dial printing at least one device pixel per CSS pixel.
      const nextRatio = average > 60 ? 1 : average > 32 ? 1.25 : ratio
      this.frameDuration = 0
      this.measuredFrames = 0
      if (nextRatio < ratio) {
        this.renderer.setPixelRatio(nextRatio)
        this.invalidate()
      }
    }
  }

  private updateLabels() {
    for (const { label, leader } of this.bound) { label.hidden = true; leader.style.display = 'none' }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const point of this.boundsPoints) {
      this.projected.copy(point).project(this.camera)
      const x = (this.projected.x + 1) * .5 * this.width
      const y = (1 - this.projected.y) * .5 * this.height
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    this.canvas.dataset.bounds = JSON.stringify({ minX, minY, maxX, maxY, width: this.width, height: this.height })
    this.canvas.dataset.visibleLabels = '0'
    if (!this.labels || !this.model) return
    const p = this.progress.getSnapshot().progress
    const mobile = this.width < 700
    const stage = storyStageIndex(p)
    const names: readonly string[] = storyStages[stage].nodes
    const candidates = this.selected ? [this.byId.get(this.selected)!] : names.map(name => this.byId.get(name)!)
    let count = 0
    const occupied: { x: number; y: number; height: number }[] = []
    this.scene.updateMatrixWorld(true)
    for (const entry of candidates) {
      if (!entry || count >= (mobile ? 1 : 2)) break
      const { part, object, label, leader } = entry
      if ((part.category === 'movement' || part.category === 'fastener') && p < .44) continue
      this.worldAnchor.fromArray(part.labelAnchor).applyMatrix4(object.matrixWorld)
      this.projected.copy(this.worldAnchor).project(this.camera)
      if (this.projected.z < -1 || this.projected.z > 1) continue
      const x = (this.projected.x * 0.5 + 0.5) * this.width
      const y = (-this.projected.y * 0.5 + 0.5) * this.height
      if (x < 0 || x > this.width || y < 0 || y > this.height) continue
      this.direction.copy(this.worldAnchor).sub(this.camera.position)
      const distance = this.direction.length()
      this.labelRay.set(this.camera.position, this.direction.normalize())
      const hit = this.labelRay.intersectObjects(this.pickable, false)[0]
      if (hit && hit.distance < distance - .075 && hit.object.userData.partId !== part.id) continue
      const labelWidth = 216
      const side = count % 2 === 0 ? (x < this.width / 2 ? 'left' : 'right') : (occupied[0]?.x === 20 ? 'right' : 'left')
      const labelX = side === 'left' ? 20 : this.width - labelWidth - 20
      const labelY = Math.max(16, Math.min(this.height - 112, y - 35))
      if (!mobile && (labelX < 0 || occupied.some(other => Math.abs(other.x - labelX) < labelWidth && Math.abs(other.y - labelY) < other.height + 16))) continue
      // Desktop callouts live in the free margins, never on the projected object.
      if (!mobile && ((side === 'left' && labelX + labelWidth > minX - 12) || (side === 'right' && labelX < maxX + 12))) continue
      label.style.transform = mobile ? '' : `translate(${labelX}px, ${labelY}px)`
      label.dataset.selected = String(part.id === this.selected)
      label.hidden = false
      const boundary = (stage - .5) / 5
      const next = (stage + .5) / 5
      const edgeFade = Math.min(1, Math.max(0, (p - boundary) / .025), Math.max(0, (next - p) / .025))
      // Keep the incoming explanation readable even when scroll stops exactly
      // on a chapter boundary (for example 50%); no empty flash between labels.
      const opacity = this.selected ? 1 : .78 + .22 * edgeFade
      label.style.opacity = String(opacity)
      if (!mobile) {
        const edge = side === 'left' ? labelX + labelWidth + 6 : labelX - 6
        leader.setAttribute('d', `M${x},${y} L${edge + (side === 'left' ? 20 : -20)},${labelY + 18} L${edge},${labelY + 18}`)
        leader.style.display = ''
        leader.style.opacity = String(opacity * .65)
      }
      occupied.push({ x: labelX, y: labelY, height: 80 })
      count++
    }
    this.canvas.dataset.visibleLabels = String(count)
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
      this.rig.suspend()
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
