import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressController } from './progressController'
import { progressFromScroll, scrollFromProgress, ScrollCoordinator } from './scrollCoordinator'

const integration = vi.hoisted(() => {
  type TriggerOptions = {
    start: () => number; end: () => number; pin: boolean; scrub: boolean
    onUpdate: (trigger: MockTrigger) => void; onRefresh: (trigger: MockTrigger) => void
  }
  const triggers = new Set<MockTrigger>()
  class MockTrigger {
    progress = 0
    constructor(readonly options: TriggerOptions) { triggers.add(this); this.refresh() }
    update() {
      const next = Math.max(0, Math.min(1, (window.scrollY - this.options.start()) / (this.options.end() - this.options.start())))
      if (next !== this.progress) { this.progress = next; this.options.onUpdate(this) }
    }
    refresh() { this.update(); this.options.onRefresh(this) }
    kill() { triggers.delete(this) }
  }
  type ScrollOptions = {
    immediate?: boolean; duration?: number; easing?: (t: number) => number; onComplete?: () => void
  }
  type LenisOptions = {
    autoRaf: boolean; autoResize: boolean; smoothWheel: boolean; syncTouch: boolean; lerp: number
    prevent: (node: HTMLElement) => boolean
  }
  const instances: MockLenis[] = []
  class MockLenis {
    animatedScroll = window.scrollY
    isScrolling: false | 'smooth' = false
    destroyed = false
    rafTimes: number[] = []
    private listeners = new Set<() => void>()
    private lastTime: number | null = null
    private motion: { from: number; to: number; elapsed: number; options: ScrollOptions } | null = null
    constructor(readonly options: LenisOptions) { instances.push(this) }
    get scroll() { return this.animatedScroll }
    on(_event: string, callback: () => void) { this.listeners.add(callback) }
    off(_event: string, callback: () => void) { this.listeners.delete(callback) }
    private emit() { this.listeners.forEach(callback => callback()) }
    raf(time: number) {
      this.rafTimes.push(time)
      const delta = this.lastTime === null ? 0 : time - this.lastTime
      this.lastTime = time
      const motion = this.motion
      if (!motion) return
      motion.elapsed += delta
      const p = Math.min(1, motion.elapsed / ((motion.options.duration ?? 1) * 1000))
      this.animatedScroll = motion.from + (motion.to - motion.from) * (motion.options.easing?.(p) ?? p)
      window.scrollTo({ top: this.animatedScroll })
      this.emit()
      if (p === 1) {
        this.motion = null; this.isScrolling = false
        motion.options.onComplete?.()
      }
    }
    scrollTo(to: number, options: ScrollOptions) {
      if (options.immediate) {
        this.motion = null; this.isScrolling = false; this.animatedScroll = to
        window.scrollTo({ top: to }); this.emit(); return
      }
      this.motion = { from: window.scrollY, to, elapsed: 0, options }
      this.isScrolling = 'smooth'
    }
    stop() { this.motion = null; this.isScrolling = false; this.animatedScroll = window.scrollY; this.emit() }
    start() { this.animatedScroll = window.scrollY; this.emit() }
    resize() { this.animatedScroll = window.scrollY; this.emit() }
    destroy() { this.destroyed = true; this.listeners.clear() }
  }
  const ticker = new Set<(time: number) => void>()
  return {
    ticker, triggers, instances, MockLenis,
    create: vi.fn((options: TriggerOptions) => new MockTrigger(options)),
    update: vi.fn(() => triggers.forEach(trigger => trigger.update())),
    add: vi.fn((callback: (time: number) => void) => ticker.add(callback)),
    remove: vi.fn((callback: (time: number) => void) => ticker.delete(callback)),
    lagSmoothing: vi.fn(), registerPlugin: vi.fn(),
  }
})
vi.mock('gsap', () => ({ gsap: {
  registerPlugin: integration.registerPlugin,
  ticker: { add: integration.add, remove: integration.remove, lagSmoothing: integration.lagSmoothing },
} }))
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: { create: integration.create, update: integration.update } }))
vi.mock('lenis', () => ({ default: integration.MockLenis }))

let callbacks: Map<number, FrameRequestCallback>, id: number, now: number
let progress: ProgressController, coordinator: ScrollCoordinator
let height: number, pinHeight: number
let win: EventTarget & { scrollY: number; scrollTo: (options: ScrollToOptions) => void }
let doc: EventTarget & { hidden: boolean; fonts: { ready: Promise<void> } }
const step = (ms = 16) => {
  now += ms
  const due = [...callbacks.values()]
  callbacks.clear()
  due.forEach(callback => callback(now))
  integration.ticker.forEach(callback => callback(now / 1000))
}
const scroll = (y: number) => { win.scrollY = y; win.dispatchEvent(new Event('scroll')) }
const connect = () => {
  const section = {
    get offsetHeight() { return height },
    getBoundingClientRect: () => ({ top: 120 - win.scrollY }), dataset: {} as Record<string, string>,
  } as unknown as HTMLElement
  coordinator.connect(section, { get offsetHeight() { return pinHeight } } as HTMLElement)
  return section
}

beforeEach(() => {
  vi.clearAllMocks()
  integration.ticker.clear(); integration.triggers.clear(); integration.instances.length = 0
  callbacks = new Map(); id = 0; now = 0; height = 5000; pinHeight = 1000
  win = Object.assign(new EventTarget(), {
    scrollY: 0, scrollTo: (options: ScrollToOptions) => scroll(Math.round(options.top!)),
    history: { state: null as unknown, replaceState(value: unknown) { this.state = value } },
    location: { pathname: '/' }, sessionStorage: { setItem() {}, getItem() { return null } },
  })
  doc = Object.assign(new EventTarget(), { hidden: false, fonts: { ready: Promise.resolve() } })
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
  vi.stubGlobal('Element', class {})
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key))
  progress = new ProgressController()
  coordinator = new ScrollCoordinator(progress, false)
})
afterEach(() => { coordinator.dispose(); progress.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('Lenis and ScrollTrigger scroll ownership', () => {
  it('uses one GSAP ticker, converts seconds to Lenis milliseconds and keeps CSS pinning', () => {
    const section = connect()
    const lenis = integration.instances[0]
    expect(section.dataset.scrollEngine).toBe('gsap-lenis')
    expect(section.dataset.storyStart).toBe('120')
    expect(section.dataset.storyTravel).toBe('4000')
    expect(lenis.options).toMatchObject({ autoRaf: false, autoResize: false, smoothWheel: true, syncTouch: false, lerp: .075 })
    expect(integration.create.mock.calls[0][0]).toMatchObject({ pin: false, scrub: false })
    expect(integration.ticker.size).toBe(1)
    expect(integration.lagSmoothing).toHaveBeenCalledWith(0)
    step(125)
    expect(lenis.rafTimes).toEqual([125])
    expect(lenis.options.prevent({ tagName: 'DIALOG', hasAttribute: () => false } as unknown as HTMLElement)).toBe(true)
    expect(lenis.options.prevent({ tagName: 'DIV', hasAttribute: (name: string) => name === 'data-lenis-prevent' } as unknown as HTMLElement)).toBe(true)
    expect(lenis.options.prevent({ tagName: 'DIV', hasAttribute: () => false } as unknown as HTMLElement)).toBe(false)
  })
  it('maps and clamps both directions without accumulated offsets', () => {
    const bounds = { start: 120, travel: 4000 }
    for (const p of [0, .04, .25, .531, 1, .4, 0]) expect(progressFromScroll(scrollFromProgress(p, bounds), bounds)).toBeCloseTo(p, 12)
    expect(progressFromScroll(-200, bounds)).toBe(0)
    expect(progressFromScroll(9000, bounds)).toBe(1)
    expect(progressFromScroll(1, { start: 0, travel: 0 })).toBe(1)
  })
  it('reads a browser-restored scroll position on connection', () => {
    win.scrollY = 1720; connect()
    expect(progress.getSnapshot().progress).toBe(.4)
    expect(win.scrollY).toBe(1720)
  })
  it('preserves a quick reload before native scroll restoration has recorded the position', () => {
    const history = { state: null as unknown, replaceState(value: unknown) { this.state = value } }
    Object.assign(win, { history })
    connect(); progress.set(.63)
    win.dispatchEvent(new Event('pagehide'))
    coordinator.dispose(); win.scrollY = 0
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([{ type: 'reload' }] as unknown as PerformanceEntry[])
    coordinator = new ScrollCoordinator(progress, false); connect()
    win.dispatchEvent(new Event('pageshow'))
    expect(win.scrollY).toBe(2640)
    expect(progress.getSnapshot().progress).toBe(.63)
  })
  it('makes the slider move the document, then reads the same progress', () => {
    connect(); progress.set(.375)
    expect(win.scrollY).toBe(1620)
    expect(progress.getSnapshot()).toEqual({ progress: .375, target: null })
    scroll(3120); expect(progress.getSnapshot().progress).toBe(.75)
    scroll(120); expect(progress.getSnapshot().progress).toBe(0)
  })
  it('animates only document scroll and stops immediately on wheel input', () => {
    connect(); progress.animateTo(1); step(); step(1600)
    const p = progress.getSnapshot().progress
    expect(p).toBeGreaterThan(0)
    expect(p).toBe(progressFromScroll(win.scrollY, { start: 120, travel: 4000 }))
    win.dispatchEvent(new Event('wheel'))
    expect(progress.getSnapshot().target).toBe(null)
    const y = win.scrollY
    step(20000)
    expect(win.scrollY).toBe(y)
    expect(progress.getSnapshot().progress).toBe(p)
  })
  it('visits an intermediate stop through the same Lenis clock without jumping or starting another RAF', () => {
    connect(); progress.set(.04)
    const before = win.scrollY
    expect(coordinator.navigateTo(.78)).toBe(true)
    expect(win.scrollY).toBe(before)
    expect(progress.getSnapshot()).toEqual({ progress: .04, target: null })
    expect(callbacks.size).toBe(0)
    step(); step(900)
    expect(progress.getSnapshot().progress).toBeGreaterThan(.04)
    expect(progress.getSnapshot().progress).toBeLessThan(.78)
    expect(progress.getSnapshot().progress).toBe(progressFromScroll(win.scrollY, { start: 120, travel: 4000 }))
    step(9000)
    expect(win.scrollY).toBe(3240)
    expect(progress.getSnapshot()).toEqual({ progress: .78, target: null })
    expect(integration.instances).toHaveLength(1)
    expect(integration.ticker.size).toBe(1)
  })
  it('cancels a product-stop passage on wheel, touch or keys, and replaces an old destination', () => {
    connect()
    for (const type of ['wheel', 'touchstart', 'keydown']) {
      progress.set(.04); coordinator.navigateTo(.78); step(); step(400)
      const p = progress.getSnapshot().progress, y = win.scrollY
      const event = type === 'keydown' ? Object.assign(new Event(type), { key: 'PageDown' }) : new Event(type)
      win.dispatchEvent(event)
      step(60000)
      expect(win.scrollY).toBe(y)
      expect(progress.getSnapshot()).toEqual({ progress: p, target: null })
    }
    progress.set(.04); coordinator.navigateTo(.78); step(); step(400)
    coordinator.navigateTo(.28); step(4000)
    expect(win.scrollY).toBe(1240)
    expect(progress.getSnapshot()).toEqual({ progress: .28, target: null })
    step(60000)
    expect(win.scrollY).toBe(1240)
  })
  it('measures a resized story before navigation and keeps manual and reduced navigation explicit', () => {
    connect(); progress.set(.4)
    height = 4200; pinHeight = 800
    coordinator.navigateTo(.53); step(); step(3000)
    expect(win.scrollY).toBe(1922)
    expect(progress.getSnapshot()).toEqual({ progress: .53, target: null })
    coordinator.inspect()
    expect(coordinator.navigateTo(.28)).toBe(false)
    expect(progress.getSnapshot().progress).toBe(.53)
    coordinator.dispose(); coordinator = new ScrollCoordinator(progress, true); connect()
    coordinator.resume(); step()
    expect(coordinator.navigateTo(.28)).toBe(true)
    expect(win.scrollY).toBe(1072)
    expect(progress.getSnapshot()).toEqual({ progress: .28, target: null })
    expect(integration.ticker.size).toBe(0)
  })
  it('allows reversing buttons, pause and exact story endpoints', () => {
    connect(); progress.animateTo(1); step(); step(3000)
    progress.animateTo(0); step(); step(10000)
    expect(progress.getSnapshot()).toEqual({ progress: 0, target: null })
    progress.animateTo(1, true)
    expect(win.scrollY).toBe(4120)
    expect(progress.getSnapshot()).toEqual({ progress: 1, target: null })
  })
  it('plays a 42-second film through actual scroll, including holds, with a single shared clock', () => {
    connect(); progress.set(0)
    progress.animateTo(1); step()
    expect(progress.getSnapshot()).toEqual({ progress: 0, target: 1 })
    expect(callbacks.size).toBe(0)
    step(21000)
    expect(progress.getSnapshot()).toEqual({ progress: .5, target: 1 })
    expect(win.scrollY).toBe(2120)
    step(21000)
    expect(win.scrollY).toBe(4120)
    expect(progress.getSnapshot()).toEqual({ progress: 1, target: null })
    expect(integration.ticker.size).toBe(1)
    expect(integration.instances).toHaveLength(1)
  })
  it('lets an immediate native scrollbar jump supersede an unfinished Lenis passage', () => {
    connect(); progress.animateTo(1); step(); step(700)
    expect(progress.getSnapshot().target).toBe(1)
    scroll(2120)
    expect(progress.getSnapshot()).toEqual({ progress: .5, target: null })
    step(10000)
    expect(win.scrollY).toBe(2120)
    expect(progress.getSnapshot().progress).toBe(.5)
  })
  it('seeks a range input exactly during playback without a queued tween or second RAF', () => {
    connect(); progress.animateTo(1)
    expect(callbacks.size).toBe(0)
    step(); step(900); progress.set(.8125)
    expect(win.scrollY).toBe(3370)
    expect(progress.getSnapshot()).toEqual({ progress: .8125, target: null })
    step(10000)
    expect(win.scrollY).toBe(3370)
    expect(integration.ticker.size).toBe(1)
    expect(integration.instances).toHaveLength(1)
  })
  it('keeps manual progress independent of page scroll and synchronizes on resume', () => {
    connect(); progress.set(.4); coordinator.inspect()
    progress.set(.64)
    scroll(500)
    expect(progress.getSnapshot().progress).toBe(.64)
    expect(coordinator.getSnapshot().mode).toBe('manual')
    coordinator.resume(); step()
    expect(win.scrollY).toBe(2680)
    expect(progress.getSnapshot().progress).toBe(.64)
    expect(coordinator.getSnapshot().mode).toBe('story')
    scroll(2920); expect(progress.getSnapshot().progress).toBe(.7)
  })
  it('detaches ownership before manual listeners freeze the shown pose and releases Lenis', () => {
    connect(); progress.set(.4)
    const original = integration.instances[0]
    const unsubscribe = coordinator.subscribe(() => {
      if (coordinator.getSnapshot().mode === 'manual') progress.set(.3875)
    })
    coordinator.inspect()
    expect(original.destroyed).toBe(true)
    expect(integration.ticker.size).toBe(0)
    expect(win.scrollY).toBe(1720)
    expect(progress.getSnapshot().progress).toBe(.3875)
    unsubscribe(); coordinator.resume()
    expect(win.scrollY).toBe(1670)
    expect(progress.getSnapshot().progress).toBe(.3875)
    expect(integration.instances).toHaveLength(2)
    expect(integration.ticker.size).toBe(1)
  })
  it('preserves progress and mode when active section length changes', () => {
    connect(); progress.set(.4)
    height = 4200; pinHeight = 800
    win.dispatchEvent(new Event('resize')); step()
    expect(win.scrollY).toBe(1480)
    expect(progress.getSnapshot().progress).toBe(.4)
    expect(coordinator.getSnapshot().mode).toBe('story')
    coordinator.inspect(); progress.set(.7)
    height = 3600; win.dispatchEvent(new Event('resize')); step()
    expect(progress.getSnapshot().progress).toBe(.7)
    expect(coordinator.getSnapshot().mode).toBe('manual')
  })
  it('does not move a reader who is outside the story during resize', () => {
    connect(); scroll(4800)
    height = 4200; win.dispatchEvent(new Event('resize')); step()
    expect(win.scrollY).toBe(4800)
    expect(progress.getSnapshot().progress).toBe(1)
  })
  it('interrupts programmatic scrolling on touch, keyboard and hidden tabs', () => {
    connect()
    for (const type of ['touchstart', 'keydown', 'visibilitychange']) {
      progress.set(.2); progress.animateTo(1); step(); step(500)
      if (type === 'visibilitychange') { doc.hidden = true; doc.dispatchEvent(new Event(type)) }
      else if (type === 'keydown') win.dispatchEvent(Object.assign(new Event(type), { key: 'PageDown' }))
      else win.dispatchEvent(new Event(type))
      const p = progress.getSnapshot().progress
      step(60000)
      expect(progress.getSnapshot()).toEqual({ progress: p, target: null })
      doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange'))
    }
  })
  it('starts reduced motion in a compact manual experience', () => {
    coordinator.dispose(); coordinator = new ScrollCoordinator(progress, true); connect()
    expect(coordinator.getSnapshot()).toEqual({ mode: 'manual', compact: true })
    progress.animateTo(1, true)
    expect(progress.getSnapshot().progress).toBe(1)
    scroll(1000)
    expect(progress.getSnapshot().progress).toBe(1)
    expect(integration.instances).toHaveLength(0)
    coordinator.resume(); step()
    expect(coordinator.getSnapshot()).toEqual({ mode: 'story', compact: false })
    expect(integration.instances).toHaveLength(0)
    progress.animateTo(0)
    expect(win.scrollY).toBe(120)
    expect(progress.getSnapshot()).toEqual({ progress: 0, target: null })
  })
  it('destroys hidden-tab inertia and resumes from the current document position', () => {
    connect(); progress.animateTo(1); step(); step(700)
    const first = integration.instances[0]
    doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange'))
    expect(first.destroyed).toBe(true)
    expect(integration.ticker.size).toBe(0)
    scroll(2640); step(20000)
    doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); step()
    expect(win.scrollY).toBe(2640)
    expect(progress.getSnapshot()).toEqual({ progress: .63, target: null })
    expect(integration.instances).toHaveLength(2)
    expect(integration.ticker.size).toBe(1)
    coordinator.dispose()
    expect(integration.ticker.size).toBe(0)
    expect(integration.triggers.size).toBe(0)
  })
})
