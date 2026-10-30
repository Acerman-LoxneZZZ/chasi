import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { clampProgress, smootherStep } from './evaluatePartTransform'
import { ProgressController, type ProgressOwner } from './progressController'

export type ViewMode = 'story' | 'manual'
export type StoryBounds = { start: number; travel: number }
type SavedScroll = { y: number; progress: number; active: boolean }

export const progressFromScroll = (scrollY: number, bounds: StoryBounds) =>
  clampProgress((scrollY - bounds.start) / Math.max(1, bounds.travel))
export const scrollFromProgress = (progress: number, bounds: StoryBounds) =>
  bounds.start + clampProgress(progress) * Math.max(1, bounds.travel)

/** Lenis moves the native document; a standalone ScrollTrigger owns story progress. */
export class ScrollCoordinator implements ProgressOwner {
  private snapshot: { mode: ViewMode; compact: boolean }
  private listeners = new Set<() => void>()
  private section: HTMLElement | null = null
  private pin: HTMLElement | null = null
  private observer: ResizeObserver | null = null
  private trigger: ScrollTrigger | null = null
  private lenis: Lenis | null = null
  private measureFrame = 0
  private resumeFrame = 0
  private target: 0 | 1 | null = null
  private navigating = false
  private passage = 0
  private initialized = false
  private measuring = false
  private syncingLenis = false
  private bounds: StoryBounds = { start: 0, travel: 1 }
  private restored: SavedScroll | null = null
  private stored = ''
  private previousScrollBehavior: { value: string; priority: string } | null = null

  constructor(private progress: ProgressController, private reducedMotion: boolean) {
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
    const style = document.documentElement?.style
    if (style) {
      this.previousScrollBehavior = { value: style.getPropertyValue('scroll-behavior'), priority: style.getPropertyPriority('scroll-behavior') }
      style.setProperty('scroll-behavior', 'auto', 'important')
    }
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
    gsap.registerPlugin(ScrollTrigger)
    try {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
      if (navigation?.type === 'reload' || navigation?.type === 'back_forward') {
        let saved = window.history.state?.watchStory
        if (!saved && navigation.type === 'reload') {
          const serialized = window.sessionStorage.getItem(`hod-vremeni:scroll:${window.location.pathname}`)
          if (serialized) saved = JSON.parse(serialized)
        }
        if (saved && Number.isFinite(saved.y) && Number.isFinite(saved.progress)) {
          this.restored = { y: saved.y, progress: clampProgress(saved.progress), active: saved.active === true }
        }
      }
    } catch { /* Native restoration remains available when storage is restricted. */ }
    this.measure()
    this.startSmoothScroll()
    if (document.readyState === 'complete') this.onPageShow()
    document.fonts.ready.then(() => { if (this.section) this.scheduleMeasure() })
  }

  private startSmoothScroll() {
    if (this.lenis || !this.section || this.snapshot.mode !== 'story' || this.reducedMotion || document.hidden) return
    this.lenis = new Lenis({
      autoRaf: false,
      autoResize: false,
      smoothWheel: true,
      syncTouch: false,
      lerp: .085,
      anchors: true,
      stopInertiaOnNavigate: true,
      prevent: node => node.hasAttribute('data-lenis-prevent') || node.tagName === 'DIALOG' || node.hasAttribute('popover'),
    })
    // Official integration: GSAP's one ticker drives Lenis in milliseconds.
    this.lenis.on('scroll', this.onLenisScroll)
    gsap.ticker.add(this.tickLenis)
    gsap.ticker.lagSmoothing(0)
    this.section.dataset.scrollEngine = 'gsap-lenis'
  }
  private stopSmoothScroll() {
    if (!this.lenis) return
    gsap.ticker.remove(this.tickLenis)
    this.lenis.off('scroll', this.onLenisScroll)
    this.lenis.stop()
    this.lenis.destroy()
    this.lenis = null
    if (this.section) this.section.dataset.scrollEngine = 'native-scrolltrigger'
  }
  private tickLenis = (time: number) => {
    if (!document.hidden) this.lenis?.raf(time * 1000)
  }
  private onLenisScroll = () => {
    if (!this.syncingLenis && !this.measuring) this.syncProgress()
  }
  private stopLenisMotion() {
    if (!this.lenis) return
    this.syncingLenis = true
    // stop/start cancels the single Lenis passage, then releases native scrolling.
    // A persistent stopped class would clip the whole document with Lenis CSS.
    this.lenis.stop()
    this.lenis.start()
    this.syncingLenis = false
  }

  private scheduleMeasure = () => {
    if (!this.measureFrame) this.measureFrame = requestAnimationFrame(() => { this.measureFrame = 0; this.measure() })
  }
  private measure = () => {
    if (!this.section || !this.pin || this.measuring) return
    const old = this.bounds
    const y = window.scrollY
    const active = this.initialized && y >= old.start - 1 && y <= old.start + old.travel + 1
    const p = this.snapshot.mode === 'story' ? this.progress.getSnapshot().progress : progressFromScroll(y, old)
    this.measuring = true
    this.bounds = {
      start: this.section.getBoundingClientRect().top + y,
      travel: Math.max(1, this.section.offsetHeight - this.pin.offsetHeight),
    }
    const changed = Math.abs(old.start - this.bounds.start) > .5 || Math.abs(old.travel - this.bounds.travel) > .5
    this.initialized = true
    if (changed) {
      this.pause()
      this.lenis?.resize()
      if (active && !this.snapshot.compact) this.jumpTo(scrollFromProgress(p, this.bounds))
    }
    this.section.dataset.storyStart = String(this.bounds.start)
    this.section.dataset.storyTravel = String(this.bounds.travel)
    if (!this.trigger) {
      this.trigger = ScrollTrigger.create({
        id: 'watch-story', trigger: this.section,
        start: () => this.bounds.start,
        end: () => this.bounds.start + this.bounds.travel,
        pin: false, scrub: false, invalidateOnRefresh: true,
        onUpdate: self => this.publishProgress(self.progress),
        onRefresh: self => this.publishProgress(self.progress),
      })
    } else if (changed) this.trigger.refresh()
    this.measuring = false
    this.syncProgress()
  }
  private publishProgress(value: number) {
    if (!this.initialized || this.measuring || this.syncingLenis) return
    if (this.snapshot.mode === 'story') this.progress.commit(clampProgress(value), this.target)
    this.storeScroll()
  }
  private syncProgress() {
    if (!this.trigger || !this.initialized || this.measuring || this.syncingLenis) return
    ScrollTrigger.update()
    this.publishProgress(this.trigger.progress)
  }
  private onScroll = () => {
    if (!this.initialized || this.measuring || this.syncingLenis) return
    // Native scrollbar drags/window.scrollTo must supersede an active Lenis
    // passage too; otherwise its next tick would pull the document backwards.
    if (this.lenis?.isScrolling === 'smooth' && Math.abs(window.scrollY - this.lenis.scroll) > 2) {
      this.target = null
      this.navigating = false
      this.passage++
      this.stopLenisMotion()
    }
    this.syncProgress()
  }
  private jumpTo(y: number) {
    if (this.lenis) this.lenis.scrollTo(y, { immediate: true, force: true })
    else window.scrollTo({ top: y, behavior: 'instant' })
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
    this.startSmoothScroll()
    if (this.restored && this.snapshot.mode === 'story') {
      const saved = this.restored
      this.restored = null
      this.jumpTo(saved.active ? scrollFromProgress(saved.progress, this.bounds) : saved.y)
    }
    this.syncProgress()
  }
  private onPageHide = () => {
    const y = window.scrollY
    try {
      window.history.replaceState({ ...window.history.state, watchStory: {
        y, progress: progressFromScroll(y, this.bounds), active: y >= this.bounds.start && y <= this.bounds.start + this.bounds.travel,
      } }, '')
    } catch { /* Browsing still works without persistent state. */ }
    this.progress.pause()
    this.stopSmoothScroll()
  }

  seek = (value: number) => {
    this.pause()
    if (!this.section) return
    this.measure()
    this.jumpTo(scrollFromProgress(value, this.bounds))
    this.syncProgress()
  }
  /** Smoothly visit a product stop. Manual mode must be resumed explicitly. */
  navigateTo = (value: number): boolean => {
    if (!this.section || this.snapshot.mode !== 'story') return false
    this.pause()
    this.measure()
    const destination = clampProgress(value)
    if (this.reducedMotion) { this.seek(destination); return true }
    this.startSmoothScroll()
    const from = window.scrollY
    const to = scrollFromProgress(destination, this.bounds)
    if (!this.lenis || Math.abs(to - from) < 1) { this.seek(destination); return true }
    this.navigating = true
    const passage = ++this.passage
    this.lenis.scrollTo(to, {
      duration: Math.max(1.5, Math.min(2.4, Math.abs(to - from) / this.bounds.travel * 2.4)),
      easing: smootherStep,
      lock: false,
      onComplete: () => {
        if (passage !== this.passage) return
        this.navigating = false
        this.syncProgress()
      },
    })
    return true
  }
  animate = (target: 0 | 1, reducedMotion: boolean) => {
    this.pause()
    if (!this.section || this.snapshot.mode !== 'story') return
    if (reducedMotion || this.reducedMotion) { this.seek(target); return }
    this.startSmoothScroll()
    const from = window.scrollY
    const to = scrollFromProgress(target, this.bounds)
    if (Math.abs(to - from) < 1 || !this.lenis) { this.seek(target); return }
    this.target = target
    const passage = ++this.passage
    this.syncProgress()
    this.lenis.scrollTo(to, {
      duration: Math.max(.35, Math.min(9, Math.abs(to - from) / this.bounds.travel * 6.5)),
      easing: smootherStep,
      lock: false,
      onComplete: () => {
        if (passage !== this.passage) return
        this.target = null
        this.syncProgress()
      },
    })
  }
  pause = () => {
    this.passage++
    this.target = null
    this.navigating = false
    this.stopLenisMotion()
    this.progress.commit(this.progress.getSnapshot().progress, null)
  }
  inspect = () => {
    cancelAnimationFrame(this.resumeFrame)
    this.resumeFrame = 0
    this.pause()
    this.stopSmoothScroll()
    this.progress.attachOwner(null)
    this.emit('manual', this.snapshot.compact)
  }
  resume = () => {
    this.progress.pause()
    const p = this.progress.getSnapshot().progress
    const handoff = () => {
      this.resumeFrame = 0
      if (this.snapshot.mode !== 'manual' || !this.section) return
      try { this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* Retain the known preference. */ }
      this.initialized = false
      this.measure()
      this.jumpTo(scrollFromProgress(p, this.bounds))
      this.progress.attachOwner(this)
      this.emit('story', false)
      this.startSmoothScroll()
      this.syncProgress()
    }
    if (this.snapshot.compact) {
      this.emit('manual', false)
      this.resumeFrame = requestAnimationFrame(handoff)
    } else handoff()
  }
  reduceMotion = () => {
    cancelAnimationFrame(this.resumeFrame)
    this.resumeFrame = 0
    this.progress.pause()
    this.stopSmoothScroll()
    this.reducedMotion = true
    this.progress.attachOwner(null)
    this.emit('manual', true)
  }
  private onManualInput = (event: Event) => {
    if (this.snapshot.mode === 'story' && (this.target !== null || this.navigating || event.type === 'touchstart')) this.pause()
  }
  private onKeyDown = (event: KeyboardEvent) => {
    if (this.snapshot.mode === 'story') {
      const activation = event.key === ' ' || event.key === 'Enter'
      const button = activation && event.target instanceof Element ? event.target.closest('button[data-pause-transition="true"]') : null
      if (button) event.preventDefault()
      this.pause()
    } else if (event.key === 'Escape') this.progress.pause()
  }
  private onVisibility = () => {
    if (document.hidden) {
      this.progress.pause()
      this.stopSmoothScroll()
    } else {
      this.startSmoothScroll()
      this.syncProgress()
    }
  }
  dispose() {
    this.pause()
    this.stopSmoothScroll()
    this.trigger?.kill()
    this.trigger = null
    this.progress.attachOwner(null)
    this.section = null
    this.pin = null
    this.observer?.disconnect()
    cancelAnimationFrame(this.measureFrame)
    cancelAnimationFrame(this.resumeFrame)
    const style = document.documentElement?.style
    if (style && this.previousScrollBehavior) {
      const { value, priority } = this.previousScrollBehavior
      if (value) style.setProperty('scroll-behavior', value, priority)
      else style.removeProperty('scroll-behavior')
    }
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
