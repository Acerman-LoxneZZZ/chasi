import {
  ACESFilmicToneMapping, AmbientLight, Color, DataTexture, DirectionalLight, PerspectiveCamera,
  Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { createDetailModel, type DetailModel, type DetailSceneKind, type ProceduralSceneKind } from './detailModels'
import { loadPersonalWatch, type PersonalWatchModel, type WatchDetailKind } from './PersonalWatchModel'
import { evaluateFinale } from '../animation/finaleTimeline'
import type { WatchFinish } from '../data/collection'
import { GpuTimer } from './GpuTimer'
import { loadDetailEnvironment } from './detailEnvironment'

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
  lastVisualKey: string
  onProgress?: (progress: number) => void
}

const ORIGIN = new Vector3()
const UP = new Vector3(0, 1, 0)
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
const isWatch = (kind: DetailSceneKind): kind is WatchDetailKind => kind === 'engraving' || kind === 'assembly'
let personalization = { finish: 'brass' as WatchFinish, engraving: '' }

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
  private models: Partial<Record<ProceduralSceneKind, DetailModel>> = {}
  private nearby = new Set<DetailEntry>()
  private compiled = new Set<DetailModel>()
  private compiling = new Set<DetailModel>()
  private watchModel: PersonalWatchModel | null = null
  private watchLoading = false
  private watchFailed = false
  private watchAbort = new AbortController()
  private renderer: WebGLRenderer | null = null
  private gpuTimer: GpuTimer | null = null
  private canvas: HTMLCanvasElement | null = null
  private environment: DataTexture | null = null
  private environmentAbort = new AbortController()
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
      for (const record of records) {
        const entry = this.find(record.target)
        if (entry) {
          if (record.isIntersecting) this.nearby.add(entry)
          else this.nearby.delete(entry)
        }
      }
      this.scheduleWarmup()
    }, { rootMargin: `${Math.max(600, window.innerHeight)}px 0px`, threshold: 0 })
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

  register(host: HTMLDivElement, surface: HTMLDivElement, kind: DetailSceneKind, onProgress?: (progress: number) => void) {
    const box = host.getBoundingClientRect()
    const entry: DetailEntry = { host, surface, poster: host.querySelector<HTMLImageElement>('.detail-scene-poster'), kind, trigger: null, progress: 0, visibleArea: 0,
      width: Math.max(1, box.width), height: Math.max(1, box.height), motionTime: 0, frames: 0, lastVisualKey: '', onProgress }
    this.entries.add(entry)
    host.dataset.sceneEngine = 'three-shared'
    host.dataset.active = 'false'
    this.status(entry, this.failed ? 'error' : 'poster')
    entry.trigger = ScrollTrigger.create({
      trigger: kind === 'assembly' ? host.closest('.watch-finale')! : host,
      start: kind === 'assembly' ? 'top top' : 'top bottom',
      end: kind === 'assembly' ? 'bottom bottom' : 'bottom top',
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
      this.nearby.delete(entry)
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
    entry.onProgress?.(entry.progress)
    if (entry === this.active) this.invalidate()
  }

  updatePersonalization() {
    this.watchModel?.setPersonalization(personalization.finish, personalization.engraving)
    for (const entry of this.entries) if (isWatch(entry.kind)) {
      entry.host.dataset.finish = personalization.finish
      entry.host.dataset.engraving = personalization.engraving
      entry.lastVisualKey = ''
    }
    if (this.active && isWatch(this.active.kind)) this.invalidate()
  }

  retryWatch() {
    if (this.disposed || this.watchLoading) return
    this.watchFailed = false
    this.watchAbort = new AbortController()
    if (this.failed || this.contextLost) {
      this.releaseRenderer()
      this.failed = false
      this.contextLost = false
      this.scene.clear()
      this.prepareRenderer()
    }
    for (const entry of this.entries) if (isWatch(entry.kind)) this.status(entry, 'loading')
    this.prepareWatch()
    this.selectActive()
  }

  private prepareWatch() {
    if (this.watchModel || this.watchLoading || this.watchFailed || this.disposed || this.failed) return
    this.watchLoading = true
    const timeout = window.setTimeout(() => this.watchAbort.abort(), 30000)
    loadPersonalWatch(this.watchAbort.signal).then(model => {
      if (this.disposed) { model.dispose(); return }
      this.watchModel = model
      this.updatePersonalization()
      this.selectActive()
      this.scheduleWarmup()
    }).catch(() => {
      if (this.disposed) return
      this.watchFailed = true
      for (const entry of this.entries) if (isWatch(entry.kind)) this.status(entry, 'error')
      if (this.active && isWatch(this.active.kind)) this.stopTicking()
    }).finally(() => { this.watchLoading = false; window.clearTimeout(timeout) })
  }

  private modelFor(entry: DetailEntry) {
    return isWatch(entry.kind) ? this.watchModel : this.models[entry.kind]
  }

  private scheduleWarmup() {
    if (this.failed || this.contextLost || this.disposed || this.warmup !== null || document.hidden || !this.nearby.size) return
    const warm = () => {
      this.warmup = null
      if (this.disposed || document.hidden || this.contextLost || this.failed) return
      // Separate context/environment, geometry and shader preparation into tasks.
      // Never construct all three sculptures in the first visible scroll frame.
      if (!this.renderer) { this.prepareRenderer(); this.scheduleWarmup(); return }
      if (!this.environment) return
      for (const entry of this.nearby) {
        if (isWatch(entry.kind)) {
          if (!this.watchModel) { this.prepareWatch(); continue }
        } else if (!this.models[entry.kind]) {
          this.models[entry.kind] = createDetailModel(entry.kind)
          this.scheduleWarmup()
          return
        }
        const model = this.modelFor(entry)
        if (model && !this.compiled.has(model) && !this.compiling.has(model)) {
          this.prepareModel(model)
          this.scheduleWarmup()
          return
        }
      }
    }
    if (typeof window.requestIdleCallback === 'function') {
      this.warmupIsIdle = true
      this.warmup = window.requestIdleCallback(warm, { timeout: 250 })
    } else {
      this.warmupIsIdle = false
      this.warmup = window.setTimeout(warm, 0)
    }
  }

  private prepareModel(model: DetailModel) {
    const renderer = this.renderer!
    this.compiling.add(model)
    // Keep the real lighting when compiling an unattached model. On supported
    // GPUs this polls KHR_parallel_shader_compile instead of blocking first paint.
    renderer.compileAsync(model.root, this.camera, this.scene).then(() => {
      if (this.disposed || this.renderer !== renderer || this.contextLost) return
      this.compiling.delete(model)
      this.compiled.add(model)
      this.selectActive()
    }).catch(() => {
      if (this.disposed || this.renderer !== renderer) return
      this.failed = true
      for (const entry of this.entries) this.status(entry, 'error')
      this.releaseRenderer()
    })
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
      this.gpuTimer = new GpuTimer(renderer.getContext())
      renderer.outputColorSpace = SRGBColorSpace
      renderer.toneMapping = ACESFilmicToneMapping
      renderer.toneMappingExposure = .96
      renderer.setClearColor(new Color('#101b28'), 0)
      this.scene.environmentIntensity = .95
      this.scene.add(new AmbientLight('#cbd9e9', .4))
      const key = new DirectionalLight('#fff1d6', 2.1)
      key.position.set(-4, 5, 7)
      const fill = new DirectionalLight('#cadaee', .8)
      fill.position.set(5, 0, 4)
      const rim = new DirectionalLight('#f8d69d', 2.2)
      rim.position.set(1, 4, -5)
      this.scene.add(key, fill, rim)
      this.environmentAbort = new AbortController()
      loadDetailEnvironment(this.environmentAbort.signal).then(texture => {
        if (this.disposed || this.renderer !== renderer) { texture.dispose(); return }
        this.environment = texture
        this.scene.environment = texture
        this.scheduleWarmup()
        this.selectActive()
      }).catch(() => {
        if (this.disposed || this.renderer !== renderer) return
        this.failed = true
        for (const entry of this.entries) this.status(entry, 'error')
        this.releaseRenderer()
      })
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
    if (!this.renderer || !this.canvas) { this.scheduleWarmup(); return }
    const model = this.modelFor(best)
    if (!model) {
      if (isWatch(best.kind)) {
        if (this.watchFailed) this.status(best, 'error')
        else this.prepareWatch()
      }
      this.scheduleWarmup()
      return
    }
    if (!this.compiled.has(model)) { this.scheduleWarmup(); return }
    if (this.canvas.parentElement !== best.surface) {
      best.surface.append(this.canvas)
      for (const model of Object.values(this.models)) this.scene.remove(model.root)
      if (this.watchModel) this.scene.remove(this.watchModel.root)
      this.scene.add(model.root)
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
    // One allocation: setPixelRatio() also resizes, so following it with
    // setSize() used to clear/reallocate the drawing buffer a second time.
    this.renderer.setDrawingBufferSize(entry.width, entry.height, Math.min(window.devicePixelRatio, cap, this.qualityRatio))
    this.camera.aspect = entry.width / entry.height
    this.camera.updateProjectionMatrix()
    entry.lastVisualKey = ''
    this.invalidate()
  }

  private invalidate() {
    this.dirty = true
    if (!this.ticking && this.renderer && this.active && this.canvas?.parentElement === this.active.surface
      && !document.hidden && !this.contextLost && !this.disposed) {
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
    if (!entry || !this.renderer || !this.canvas || document.hidden || this.contextLost || this.disposed) { this.stopTicking(); return }
    const reduced = this.motionQuery.matches || !!entry.host.closest('.watch-finale--reduced')
    const continuous = !reduced && (entry.kind === 'balance' || entry.kind === 'geartrain')
    const tickGap = this.lastTick === null ? 0 : Math.max(0, time - this.lastTick)
    const elapsed = Math.min(.05, tickGap)
    this.lastTick = time
    if (!reduced) entry.motionTime += elapsed
    if (!this.dirty && !continuous) { this.stopTicking(); return }
    // A pending scroll update must respect the same budget as autonomous motion.
    // Leave it dirty so the next allowed frame paints the latest exact progress.
    if (time - this.lastPaint < this.frameInterval - .001) return
    const model = this.modelFor(entry)
    if (!model) { this.stopTicking(); return }
    const pose = reduced ? entry.kind === 'assembly' ? 1 : .5 : entry.progress
    const final = evaluateFinale(pose, reduced)
    const visualKey = isWatch(entry.kind) ? `${entry.kind}/${entry.kind === 'assembly' ? final.pose + '/' + final.camera : pose}/${reduced}` : ''
    if (visualKey && visualKey === entry.lastVisualKey) {
      entry.host.dataset.renderedProgress = entry.progress.toFixed(5)
      this.dirty = false
      this.stopTicking()
      return
    }
    if (isWatch(entry.kind)) this.watchModel!.configure(entry.kind, entry.width)
    model.update(pose, reduced ? 0 : entry.motionTime, reduced)
    if (isWatch(entry.kind)) this.watchModel!.frameCamera(this.camera, entry.width, entry.height)
    else {
    this.camera.fov = 35
    this.camera.updateProjectionMatrix()
    const yawBase = entry.kind === 'crown' ? -.3 : entry.kind === 'balance' ? -.2 : .25
    const yaw = yawBase + (reduced ? 0 : (pose - .5) * .65)
    const pitch = entry.kind === 'crown' ? .18 : .25 + (reduced ? 0 : (pose - .5) * .10)
    const distance = model.radius / Math.sin(this.camera.fov * Math.PI / 360) / .90 * Math.max(1, 1 / this.camera.aspect)
    this.direction.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
    this.camera.position.copy(this.direction).multiplyScalar(distance)
    this.camera.up.copy(UP)
    this.camera.lookAt(ORIGIN)
    this.camera.updateMatrixWorld()
    }
    const start = performance.now()
    const gpuCost = this.gpuTimer?.sample() ?? 0
    this.gpuTimer?.begin()
    this.renderer.render(this.scene, this.camera)
    this.gpuTimer?.end()
    const cost = Math.max(performance.now() - start, gpuCost)
    this.lastPaint = time
    this.dirty = false
    entry.lastVisualKey = visualKey
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
    if (isWatch(entry.kind)) {
      data.assemblyPose = this.watchModel!.visualPose.toFixed(5)
      data.finish = personalization.finish
      data.engraving = personalization.engraving
      data.partCount = '47'
      data.camera = JSON.stringify({ position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray() })
    }
    this.canvas.dataset.sceneKind = entry.kind
    if (this.renderer.info.render.calls > 0) this.status(entry, 'ready')
    // Hardware quality stays capped, while an expensive software draw lowers
    // resolution instead of maintaining several independent WebGL contexts.
    // WebGL submissions are asynchronous: short renderer.render() CPU time does
    // not prove the GPU kept up. Include the actual shared ticker cadence.
    this.slowFrames = cost > 22 || tickGap > .028 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1)
    if (this.slowFrames >= 4 && this.qualityRatio > .85) {
      this.qualityRatio = .85
      this.frameInterval = 1 / 30
      this.slowFrames = 0
      this.resizeCanvas()
    }
    if (!continuous && !this.dirty) this.stopTicking()
  }

  private onVisibility = () => {
    if (document.hidden) this.stopTicking()
    else { this.lastTick = null; this.selectActive(); this.scheduleWarmup() }
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
    this.environmentAbort.abort()
    this.gpuTimer?.dispose()
    this.gpuTimer = null
    this.environment?.dispose()
    this.environment = null
    this.scene.environment = null
    this.renderer?.dispose()
    this.renderer = null
    this.canvas?.removeEventListener('webglcontextlost', this.onContextLost)
    this.canvas?.removeEventListener('webglcontextrestored', this.onContextRestored)
    this.canvas?.remove()
    this.canvas = null
    this.compiled.clear()
    this.compiling.clear()
    for (const entry of this.entries) entry.lastVisualKey = ''
  }

  dispose() {
    this.disposed = true
    this.watchAbort.abort()
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
    for (const model of Object.values(this.models)) model.dispose()
    this.models = {}
    this.watchModel?.dispose()
    this.watchModel = null
    this.entries.clear()
    this.nearby.clear()
    this.scene.clear()
  }
}

let sharedManager: DetailSceneManager | null = null

export function registerDetailScene(host: HTMLDivElement, surface: HTMLDivElement, kind: DetailSceneKind, onProgress?: (progress: number) => void) {
  sharedManager ??= new DetailSceneManager()
  const owner = sharedManager
  const unregister = owner.register(host, surface, kind, onProgress)
  return () => {
    unregister()
    if (owner.empty) {
      owner.dispose()
      if (sharedManager === owner) sharedManager = null
    }
  }
}

export function setDetailPersonalization(finish: WatchFinish, engraving: string) {
  if (finish === personalization.finish && engraving === personalization.engraving) return
  personalization = { finish, engraving }
  sharedManager?.updatePersonalization()
}

export function retryWatchDetails() { sharedManager?.retryWatch() }
