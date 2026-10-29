import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressController } from './progressController'
import { progressFromScroll, scrollFromProgress, ScrollCoordinator } from './scrollCoordinator'

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
}
const scroll = (y: number) => { win.scrollY = y; win.dispatchEvent(new Event('scroll')) }
const connect = () => coordinator.connect({
  get offsetHeight() { return height },
  getBoundingClientRect: () => ({ top: 120 - win.scrollY }), dataset: {},
} as unknown as HTMLElement, { get offsetHeight() { return pinHeight } } as HTMLElement)

beforeEach(() => {
  callbacks = new Map(); id = 0; now = 0; height = 5000; pinHeight = 1000
  win = Object.assign(new EventTarget(), { scrollY: 0, scrollTo: (options: ScrollToOptions) => scroll(Math.round(options.top!)) })
  doc = Object.assign(new EventTarget(), { hidden: false, fonts: { ready: Promise.resolve() } })
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => callbacks.delete(key))
  progress = new ProgressController()
  coordinator = new ScrollCoordinator(progress, false)
})
afterEach(() => { coordinator.dispose(); progress.dispose(); vi.unstubAllGlobals() })

describe('native scroll ownership', () => {
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
    vi.restoreAllMocks()
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
  it('allows reversing buttons, pause and exact story endpoints', () => {
    connect(); progress.animateTo(1); step(); step(3000)
    progress.animateTo(0); step(); step(10000)
    expect(progress.getSnapshot()).toEqual({ progress: 0, target: null })
    progress.animateTo(1, true)
    expect(win.scrollY).toBe(4120)
    expect(progress.getSnapshot()).toEqual({ progress: 1, target: null })
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
      doc.hidden = false
    }
  })
  it('starts reduced motion in a compact manual experience', () => {
    coordinator.dispose(); coordinator = new ScrollCoordinator(progress, true); connect()
    expect(coordinator.getSnapshot()).toEqual({ mode: 'manual', compact: true })
    progress.animateTo(1, true)
    expect(progress.getSnapshot().progress).toBe(1)
    scroll(1000)
    expect(progress.getSnapshot().progress).toBe(1)
  })
})
