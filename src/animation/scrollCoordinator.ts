import { clampProgress } from './evaluatePartTransform'
import { ProgressController, type ProgressOwner } from './progressController'

export type ViewMode = 'story' | 'manual'
export type StoryBounds = { start: number; travel: number }

export const progressFromScroll = (scrollY: number, bounds: StoryBounds) =>
  clampProgress((scrollY - bounds.start) / Math.max(1, bounds.travel))
export const scrollFromProgress = (progress: number, bounds: StoryBounds) =>
  bounds.start + clampProgress(progress) * Math.max(1, bounds.travel)

/** Native page scroll is the only clock in story mode. Manual mode detaches it. */
export class ScrollCoordinator implements ProgressOwner {
  private snapshot: { mode: ViewMode; compact: boolean }
  private listeners = new Set<() => void>()
  private section: HTMLElement | null = null
  private pin: HTMLElement | null = null
  private observer: ResizeObserver | null = null
  private frame = 0
  private measureFrame = 0
  private target: 0 | 1 | null = null
  private initialized = false
  private bounds: StoryBounds = { start: 0, travel: 1 }
  private restored: { y: number; progress: number; active: boolean } | null = null
  private stored = ''

  constructor(private progress: ProgressController, reducedMotion: boolean) {
    this.snapshot = { mode: reducedMotion ? 'manual' : 'story', compact: reducedMotion }
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private emit(mode: ViewMode, compact: boolean) {
    this.snapshot = { mode, compact }
    this.listeners.forEach(listener => listener())
  }

  connect(section: HTMLElement, pin: HTMLElement) {
    this.section = section
    this.pin = pin
    if (this.snapshot.mode === 'story') this.progress.attachOwner(this)
    this.observer = new ResizeObserver(this.scheduleMeasure)
    this.observer.observe(section)
    this.observer.observe(pin)
    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('resize', this.scheduleMeasure, { passive: true })
    window.addEventListener('pageshow', this.onPageShow)
    window.addEventListener('pagehide', this.onPageHide)
    window.addEventListener('wheel', this.onManualInput, { passive: true, capture: true })
    window.addEventListener('touchstart', this.onManualInput, { passive: true, capture: true })
    window.addEventListener('keydown', this.onKeyDown, true)
    document.addEventListener('visibilitychange', this.onVisibility)
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (navigation?.type === 'reload' || navigation?.type === 'back_forward') {
        this.restored = window.history.state?.watchStory ?? null
        if (!this.restored && navigation.type === 'reload') {
          const saved = window.sessionStorage.getItem(`hod-vremeni:scroll:${window.location.pathname}`)
          if (saved) this.restored = JSON.parse(saved)
        }
      }
    } catch { /* Native restoration remains available when history state is restricted. */ }
    this.measure()
    if (document.readyState === 'complete') this.onPageShow()
    // Read the browser-restored position after fonts/layout, not a cached zero.
    document.fonts.ready.then(() => { if (this.section) this.scheduleMeasure() })
  }

  private scheduleMeasure = () => {
    if (!this.measureFrame) this.measureFrame = requestAnimationFrame(() => { this.measureFrame = 0; this.measure() })
  }
  private measure = () => {
    if (!this.section || !this.pin) return
    const old = this.bounds
    const y = window.scrollY
    const active = this.initialized && y >= old.start - 1 && y <= old.start + old.travel + 1
    const p = this.snapshot.mode === 'story' ? this.progress.getSnapshot().progress : progressFromScroll(y, old)
    this.bounds = {
      start: this.section.getBoundingClientRect().top + y,
      travel: Math.max(1, this.section.offsetHeight - this.pin.offsetHeight),
    }
    const changed = Math.abs(old.start - this.bounds.start) > 0.5 || Math.abs(old.travel - this.bounds.travel) > 0.5
    this.initialized = true
    if (active && changed && !this.snapshot.compact) {
      this.pause()
      window.scrollTo({ top: scrollFromProgress(p, this.bounds), behavior: 'instant' })
    }
    this.section.dataset.storyStart = String(this.bounds.start)
    this.section.dataset.storyTravel = String(this.bounds.travel)
    this.onScroll()
  }

  private onScroll = () => {
    if (this.snapshot.mode === 'story' && this.initialized) {
      this.progress.commit(progressFromScroll(window.scrollY, this.bounds), this.target)
    }
    if (this.initialized) this.storeScroll()
  }
  private storeScroll() {
    const y = window.scrollY
    const value = JSON.stringify({ y, progress: progressFromScroll(y, this.bounds), active: y >= this.bounds.start && y <= this.bounds.start + this.bounds.travel })
    if (value === this.stored) return
    this.stored = value
    try { window.sessionStorage.setItem(`hod-vremeni:scroll:${window.location.pathname}`, value) } catch { /* Storage is optional. */ }
  }
  private onPageShow = () => {
    this.measure()
    if (this.restored && this.snapshot.mode === 'story') {
      const saved = this.restored
      this.restored = null
      window.scrollTo({ top: saved.active ? scrollFromProgress(saved.progress, this.bounds) : saved.y, behavior: 'instant' })
    }
    this.onScroll()
  }
  private onPageHide = () => {
    // Save on the history entry, including a reload immediately after a range input.
    // This fills the gap before the browser records its own asynchronous scroll state.
    const y = window.scrollY
    try {
      window.history.replaceState({ ...window.history.state, watchStory: {
        y, progress: progressFromScroll(y, this.bounds), active: y >= this.bounds.start && y <= this.bounds.start + this.bounds.travel,
      } }, '')
    } catch { /* Browsing still works without persistent state. */ }
    this.progress.pause()
  }

  seek = (value: number) => {
    this.pause()
    if (!this.section) return
    window.scrollTo({ top: scrollFromProgress(value, this.bounds), behavior: 'instant' })
    this.onScroll()
  }
  animate = (target: 0 | 1, reducedMotion: boolean) => {
    this.pause()
    if (reducedMotion) { this.seek(target); return }
    const from = window.scrollY
    const to = scrollFromProgress(target, this.bounds)
    if (Math.abs(to - from) < 1) { this.seek(target); return }
    this.target = target
    const duration = Math.max(350, Math.min(9000, Math.abs(to - from) / this.bounds.travel * 6500))
    let startedAt: number | null = null
    this.onScroll()
    const tick = (time: number) => {
      this.frame = 0
      if (this.target === null || this.snapshot.mode !== 'story' || document.hidden) { this.pause(); return }
      startedAt ??= time
      const u = clampProgress((time - startedAt) / duration)
      const eased = u * u * (3 - 2 * u)
      window.scrollTo({ top: from + (to - from) * eased, behavior: 'instant' })
      this.onScroll()
      if (u === 1) this.pause()
      else this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }
  pause = () => {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    this.target = null
    this.progress.commit(this.progress.getSnapshot().progress, null)
  }
  inspect = () => {
    this.pause()
    this.progress.attachOwner(null)
    this.emit('manual', this.snapshot.compact)
  }
  resume = () => {
    this.progress.pause()
    const p = this.progress.getSnapshot().progress
    const handoff = () => {
      if (this.snapshot.mode !== 'manual' || !this.section) return
      this.initialized = false
      this.measure()
      window.scrollTo({ top: scrollFromProgress(p, this.bounds), behavior: 'instant' })
      this.progress.attachOwner(this)
      this.emit('story', false)
      this.onScroll()
    }
    if (this.snapshot.compact) {
      this.emit('manual', false)
      requestAnimationFrame(handoff)
    } else handoff()
  }
  reduceMotion = () => {
    this.progress.pause()
    this.progress.attachOwner(null)
    this.emit('manual', true)
  }
  private onManualInput = () => { if (this.snapshot.mode === 'story') this.pause() }
  private onKeyDown = (event: KeyboardEvent) => {
    if (this.snapshot.mode === 'story') {
      // Pausing changes the button label/handler. Cancel its native activation so
      // Space keyup cannot activate the newly rendered "Disassemble" button.
      const activation = event.key === ' ' || event.key === 'Enter'
      const button = activation && event.target instanceof Element ? event.target.closest('button[data-pause-transition="true"]') : null
      if (button) event.preventDefault()
      this.pause()
    } else if (event.key === 'Escape') {
      this.progress.pause()
    }
  }
  private onVisibility = () => { if (document.hidden) this.progress.pause() }
  dispose() {
    this.pause()
    this.progress.attachOwner(null)
    this.section = null
    this.pin = null
    this.observer?.disconnect()
    cancelAnimationFrame(this.measureFrame)
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('resize', this.scheduleMeasure)
    window.removeEventListener('pageshow', this.onPageShow)
    window.removeEventListener('pagehide', this.onPageHide)
    window.removeEventListener('wheel', this.onManualInput, true)
    window.removeEventListener('touchstart', this.onManualInput, true)
    window.removeEventListener('keydown', this.onKeyDown, true)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.listeners.clear()
  }
}
