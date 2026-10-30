import {
  ACESFilmicToneMapping, AmbientLight, Color, DirectionalLight, PerspectiveCamera,
  PMREMGenerator, Scene, SRGBColorSpace, Vector3, WebGLRenderer, WebGLRenderTarget,
} from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createDetailModels, type DetailModel, type DetailSceneKind } from './detailModels'

export type { DetailSceneKind } from './detailModels'

type SceneStatus = 'poster' | 'loading' | 'ready' | 'error' | 'context-lost'
interface DetailEntry {
  host: HTMLDivElement
  surface: HTMLDivElement
  poster: HTMLImageElement | null
  kind: DetailSceneKind
  trigger: ScrollTrigger | null
  progress: number
  visibleArea: number
  width: number
  height: number
  motionTime: number
  frames: number
}

const ORIGIN = new Vector3()
const UP = new Vector3(0, 1, 0)
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))

/**
 * The three editorial sculptures share one GPU context and one canvas. The
 * canvas follows the most visible host; inactive hosts keep their fallback art.
 * All scroll progress comes from ScrollTrigger and all frames from GSAP's ticker.
 */
class DetailSceneManager {
  private entries = new Set<DetailEntry>()
  private visibility: IntersectionObserver
  private proximity: IntersectionObserver
  private resizeObserver: ResizeObserver
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  private active: DetailEntry | null = null
  private models: Record<DetailSceneKind, DetailModel> | null = null
  private renderer: WebGLRenderer | null = null
  private canvas: HTMLCanvasElement | null = null
  private environment: WebGLRenderTarget | null = null
  private scene = new Scene()
  private camera = new PerspectiveCamera(35, 1, .05, 100)
  private direction = new Vector3()
  private ticking = false
  private dirty = false
  private disposed = false
  private failed = false
  private contextLost = false
  private warmup: number | null = null
  private warmupIsIdle = false
  private lastTick: number | null = null
  private lastPaint = -Infinity
  private slowFrames = 0
  private qualityRatio = 1.5
  private frameInterval = 1 / 60

  constructor() {
    gsap.registerPlugin(ScrollTrigger)
    this.visibility = new IntersectionObserver(records => {
      for (const record of records) {
        const entry = this.find(record.target)
        if (entry) entry.visibleArea = record.isIntersecting ? record.intersectionRect.width * record.intersectionRect.height : 0
      }
      this.selectActive()
    }, { rootMargin: '-76px 0px 0px', threshold: [0, .1, .25, .5, .75, 1] })
    this.proximity = new IntersectionObserver(records => {
      if (records.some(record => record.isIntersecting)) this.scheduleWarmup()
    }, { rootMargin: '250px 0px', threshold: 0 })
    this.resizeObserver = new ResizeObserver(records => {
      for (const record of records) {
        const entry = this.find(record.target)
        if (!entry) continue
        entry.width = Math.max(1, record.contentRect.width)
        entry.height = Math.max(1, record.contentRect.height)
        if (entry === this.active) this.resizeCanvas()
      }
    })
    document.addEventListener('visibilitychange', this.onVisibility)
    this.motionQuery.addEventListener('change', this.onMotionPreference)
  }

  get empty() { return this.entries.size === 0 }

  register(host: HTMLDivElement, surface: HTMLDivElement, kind: DetailSceneKind) {
    const box = host.getBoundingClientRect()
    const entry: DetailEntry = { host, surface, poster: host.querySelector<HTMLImageElement>('.detail-scene-poster'), kind, trigger: null, progress: 0, visibleArea: 0,
      width: Math.max(1, box.width), height: Math.max(1, box.height), motionTime: 0, frames: 0 }
    this.entries.add(entry)
    host.dataset.sceneEngine = 'three-shared'
    host.dataset.active = 'false'
    this.status(entry, this.failed ? 'error' : 'poster')
    entry.trigger = ScrollTrigger.create({
      trigger: host, start: 'top bottom', end: 'bottom top',
      onUpdate: trigger => this.updateProgress(entry, trigger.progress),
      onRefresh: trigger => this.updateProgress(entry, trigger.progress),
    })
    this.updateProgress(entry, entry.trigger.progress)
    this.resizeObserver.observe(host)
    this.visibility.observe(host)
    this.proximity.observe(host)
    return () => {
      entry.trigger?.kill()
      this.visibility.unobserve(host)
      this.proximity.unobserve(host)
      this.resizeObserver.unobserve(host)
      this.entries.delete(entry)
      if (this.active === entry) {
        this.detachActive()
        this.selectActive()
      }
    }
  }

  private find(target: Element) {
    for (const entry of this.entries) if (entry.host === target) return entry
    return undefined
  }

  private status(entry: DetailEntry, value: SceneStatus) {
    if (entry.host.dataset.sceneStatus === value && entry.host.dataset.status === value) return
    entry.host.dataset.sceneStatus = value
    entry.host.dataset.status = value
    if (entry.poster) entry.poster.style.opacity = value === 'ready' ? '0' : '1'
  }

  private updateProgress(entry: DetailEntry, value: number) {
    entry.progress = clamp(value)
    entry.host.dataset.progress = entry.progress.toFixed(5)
    if (entry === this.active) this.invalidate()
  }

  private scheduleWarmup() {
    if (this.renderer || this.failed || this.contextLost || this.disposed || this.warmup !== null || document.hidden) return
    const warm = () => {
      this.warmup = null
      if (!this.disposed && !document.hidden) this.prepareRenderer()
    }
    if (typeof window.requestIdleCallback === 'function') {
      this.warmupIsIdle = true
      this.warmup = window.requestIdleCallback(warm, { timeout: 500 })
    } else {
      this.warmupIsIdle = false
      this.warmup = window.setTimeout(warm, 0)
    }
  }

  private prepareRenderer() {
    if (this.renderer || this.failed || this.disposed || document.hidden) return
    try {
      const canvas = document.createElement('canvas')
      canvas.className = 'detail-canvas'
      canvas.setAttribute('aria-hidden', 'true')
      canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;'
      canvas.addEventListener('webglcontextlost', this.onContextLost)
      canvas.addEventListener('webglcontextrestored', this.onContextRestored)
      this.canvas = canvas
      const renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' })
      this.renderer = renderer
      renderer.outputColorSpace = SRGBColorSpace
      renderer.toneMapping = ACESFilmicToneMapping
      renderer.toneMappingExposure = .96
      renderer.setClearColor(new Color('#101b28'), 0)
      const room = new RoomEnvironment()
      const pmrem = new PMREMGenerator(renderer)
      // 128px is sufficient for satin metal and costs much less than a second
      // full-size product environment on mobile and software WebGL.
      try { this.environment = pmrem.fromScene(room, .07, .1, 100, { size: 128 }) }
      finally { room.dispose(); pmrem.dispose() }
      this.scene.environment = this.environment.texture
      this.scene.environmentIntensity = .95
      this.scene.add(new AmbientLight('#cbd9e9', .4))
      const key = new DirectionalLight('#fff1d6', 2.1)
      key.position.set(-4, 5, 7)
      const fill = new DirectionalLight('#cadaee', .8)
      fill.position.set(5, 0, 4)
      const rim = new DirectionalLight('#f8d69d', 2.2)
      rim.position.set(1, 4, -5)
      this.scene.add(key, fill, rim)
      this.models ??= createDetailModels()
      this.selectActive()
    } catch {
      this.failed = true
      this.stopTicking()
      for (const entry of this.entries) this.status(entry, 'error')
      this.releaseRenderer()
    }
  }

  private selectActive() {
    if (this.disposed || document.hidden || this.contextLost) { this.stopTicking(); return }
    let best: DetailEntry | null = null
    for (const entry of this.entries) if (entry.visibleArea > (best?.visibleArea ?? 0)) best = entry
    if (this.active && this.active.visibleArea > 0 && best && this.active.visibleArea >= best.visibleArea * .8) best = this.active
    if (!best || best.visibleArea <= 0) { this.detachActive(); return }
    if (this.active !== best) {
      this.detachActive()
      this.active = best
      best.host.dataset.active = 'true'
      this.status(best, this.failed ? 'error' : 'loading')
      this.lastTick = null
      this.lastPaint = -Infinity
    }
    if (!this.renderer || !this.canvas || !this.models) { this.scheduleWarmup(); return }
    if (this.canvas.parentElement !== best.surface) {
      best.surface.append(this.canvas)
      for (const model of Object.values(this.models)) this.scene.remove(model.root)
      this.scene.add(this.models[best.kind].root)
      this.resizeCanvas()
    }
    this.invalidate()
  }

  private detachActive() {
    if (!this.active) return
    this.active.host.dataset.active = 'false'
    this.status(this.active, this.failed ? 'error' : this.contextLost ? 'context-lost' : 'poster')
    this.canvas?.remove()
    this.active = null
    this.lastTick = null
    this.stopTicking()
  }

  private resizeCanvas() {
    if (!this.active || !this.renderer) return
    const entry = this.active
    const cap = entry.width < 600 ? 1.25 : 1.5
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap, this.qualityRatio))
    this.renderer.setSize(entry.width, entry.height, false)
    this.camera.aspect = entry.width / entry.height
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  private invalidate() {
    this.dirty = true
    if (!this.ticking && this.renderer && this.active && !document.hidden && !this.contextLost && !this.disposed) {
      this.ticking = true
      gsap.ticker.add(this.tick)
    }
  }

  private stopTicking() {
    if (this.ticking) gsap.ticker.remove(this.tick)
    this.ticking = false
    this.lastTick = null
  }

  private tick = (time: number) => {
    const entry = this.active
    if (!entry || !this.renderer || !this.models || !this.canvas || document.hidden || this.contextLost || this.disposed) { this.stopTicking(); return }
    const reduced = this.motionQuery.matches
    const continuous = !reduced && entry.kind !== 'crown'
    const elapsed = this.lastTick === null ? 0 : Math.max(0, Math.min(.05, time - this.lastTick))
    this.lastTick = time
    if (!reduced) entry.motionTime += elapsed
    if (!this.dirty && (!continuous || time - this.lastPaint < this.frameInterval)) {
      if (!continuous) this.stopTicking()
      return
    }
    const model = this.models[entry.kind]
    const pose = reduced ? .5 : entry.progress
    model.update(pose, reduced ? 0 : entry.motionTime, reduced)
    const yawBase = entry.kind === 'crown' ? -.3 : entry.kind === 'balance' ? -.2 : .25
    const yaw = yawBase + (reduced ? 0 : (pose - .5) * .65)
    const pitch = entry.kind === 'crown' ? .18 : .25 + (reduced ? 0 : (pose - .5) * .10)
    const distance = model.radius / Math.sin(this.camera.fov * Math.PI / 360) / .90 * Math.max(1, 1 / this.camera.aspect)
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    this.camera.position.copy(this.direction).multiplyScalar(distance)
    this.camera.up.copy(UP)
    this.camera.lookAt(ORIGIN)
    this.camera.updateMatrixWorld()
    const start = performance.now()
    this.renderer.render(this.scene, this.camera)
    const cost = performance.now() - start
    this.lastPaint = time
    this.dirty = false
    entry.frames++
    const data = entry.host.dataset
    data.renderedProgress = entry.progress.toFixed(5)
    data.poseProgress = pose.toFixed(5)
    data.frames = String(entry.frames)
    data.modelTriangles = String(this.renderer.info.render.triangles)
    data.drawCalls = String(this.renderer.info.render.calls)
    data.motionTime = entry.motionTime.toFixed(4)
    data.dpr = String(this.renderer.getPixelRatio())
    data.reducedMotion = String(reduced)
    this.canvas.dataset.sceneKind = entry.kind
    if (this.renderer.info.render.calls > 0) this.status(entry, 'ready')
    // Hardware quality stays capped, while an expensive software draw lowers
    // resolution instead of maintaining several independent WebGL contexts.
    this.slowFrames = cost > 45 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1)
    if (this.slowFrames >= 3 && this.qualityRatio > .85) {
      this.qualityRatio = .85
      this.frameInterval = 1 / 30
      this.slowFrames = 0
      this.resizeCanvas()
    }
    if (!continuous && !this.dirty) this.stopTicking()
  }

  private onVisibility = () => {
    if (document.hidden) this.stopTicking()
    else { this.lastTick = null; this.selectActive() }
  }

  private onMotionPreference = () => {
    for (const entry of this.entries) entry.motionTime = 0
    this.lastTick = null
    this.invalidate()
  }

  private onContextLost = (event: Event) => {
    event.preventDefault()
    this.contextLost = true
    this.stopTicking()
    if (this.canvas) this.canvas.style.visibility = 'hidden'
    if (this.active) this.status(this.active, 'context-lost')
  }

  private onContextRestored = () => {
    if (this.disposed) return
    this.releaseRenderer()
    this.contextLost = false
    this.failed = false
    this.scene.clear()
    this.prepareRenderer()
  }

  private releaseRenderer() {
    this.stopTicking()
    this.environment?.dispose()
    this.environment = null
    this.scene.environment = null
    this.renderer?.dispose()
    this.renderer = null
    this.canvas?.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas?.remove()
    this.canvas = null
  }

  dispose() {
    this.disposed = true
    this.stopTicking()
    if (this.warmup !== null) {
      if (this.warmupIsIdle) window.cancelIdleCallback(this.warmup)
      else window.clearTimeout(this.warmup)
    }
    this.visibility.disconnect()
    this.proximity.disconnect()
    this.resizeObserver.disconnect()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.motionQuery.removeEventListener('change', this.onMotionPreference)
    for (const entry of this.entries) entry.trigger?.kill()
    this.releaseRenderer()
    if (this.models) for (const model of Object.values(this.models)) model.dispose()
    this.models = null
    this.entries.clear()
    this.scene.clear()
  }
}

let sharedManager: DetailSceneManager | null = null

export function registerDetailScene(host: HTMLDivElement, surface: HTMLDivElement, kind: DetailSceneKind) {
  sharedManager ??= new DetailSceneManager()
  const owner = sharedManager
  const unregister = owner.register(host, surface, kind)
  return () => {
    unregister()
    if (owner.empty) {
      owner.dispose()
      if (sharedManager === owner) sharedManager = null
    }
  }
}
