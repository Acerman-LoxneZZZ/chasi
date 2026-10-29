import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressController } from './progressController'

// Deterministic RAF scheduler: browser-like cancellation and exactly one delivery per step.
let callbacks: Map<number, FrameRequestCallback>
let nextId: number
let now: number
let controller: ProgressController
const step = (milliseconds = 1000 / 60) => {
  now += milliseconds
  const due = [...callbacks.values()]
  callbacks.clear()
  due.forEach(callback => callback(now))
}
const advance = (milliseconds: number) => {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000 / 60) step()
}

beforeEach(() => {
  callbacks = new Map(); nextId = 0; now = 1000
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id) })
  vi.stubGlobal('document', { hidden: false })
  controller = new ProgressController()
})
afterEach(() => { controller.dispose(); vi.unstubAllGlobals() })

describe('single progress source', () => {
  it('starts assembled without scheduling any automatic motion', () => {
    expect(controller.getSnapshot()).toEqual({ progress: 0, target: null })
    expect(callbacks.size).toBe(0)
  })

  it('uses a single animation loop, even when a second target is requested', () => {
    controller.animateTo(1); advance(1000)
    expect(controller.getSnapshot().progress).toBeGreaterThan(0)
    controller.animateTo(0)
    expect(callbacks.size).toBe(1)
    advance(1200)
    expect(controller.getSnapshot()).toEqual({ progress: 0, target: null })
    expect(callbacks.size).toBe(0)
  })

  it('makes a full passage in approximately nine seconds and lands exactly at the endpoint', () => {
    controller.animateTo(1); step(); advance(4500)
    expect(controller.getSnapshot().progress).toBeCloseTo(0.5, 2)
    advance(4700)
    expect(controller.getSnapshot()).toEqual({ progress: 1, target: null })
    expect(callbacks.size).toBe(0)
  })

  it('shortens automatic travel in proportion to the remaining path', () => {
    controller.set(0.75); controller.animateTo(1); step(); advance(1100)
    expect(controller.getSnapshot().progress).toBeCloseTo(0.875, 2)
    advance(1200)
    expect(controller.getSnapshot()).toEqual({ progress: 1, target: null })
  })

  it('immediately gives manual input priority and cancels the programmatic animation', () => {
    controller.animateTo(1); advance(1000); controller.set(0.37)
    expect(callbacks.size).toBe(0)
    advance(3000)
    expect(controller.getSnapshot()).toEqual({ progress: 0.37, target: null })
  })

  it('uses elapsed wall time despite sparse and irregular frame delivery', () => {
    controller.animateTo(1)
    step(0)
    step(100)
    expect(controller.getSnapshot().progress).toBeCloseTo(100 / 9000, 12)
    step(1500)
    expect(controller.getSnapshot().progress).toBeCloseTo(1600 / 9000, 12)
    step(2900)
    expect(controller.getSnapshot().progress).toBeCloseTo(0.5, 12)
    step(5500)
    expect(controller.getSnapshot()).toEqual({ progress: 1, target: null })
    expect(callbacks.size).toBe(0)
  })

  it('pauses without drift and prevents a hidden tab from jumping when it returns', () => {
    controller.animateTo(1); step(); advance(1000)
    const progress = controller.getSnapshot().progress
    controller.pause(); advance(5000)
    expect(controller.getSnapshot()).toEqual({ progress, target: null })
    expect(callbacks.size).toBe(0)

    controller.animateTo(1); step(); step(500)
    const beforeHidden = controller.getSnapshot().progress
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    step(60_000)
    expect(controller.getSnapshot()).toEqual({ progress: beforeHidden, target: null })
    expect(callbacks.size).toBe(0)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    advance(9000)
    expect(controller.getSnapshot()).toEqual({ progress: beforeHidden, target: null })
  })

  it('sets a reduced-motion destination directly and treats repeated endpoint commands as stable', () => {
    controller.animateTo(1, true)
    expect(controller.getSnapshot()).toEqual({ progress: 1, target: null })
    controller.animateTo(1)
    expect(callbacks.size).toBe(0)
    controller.animateTo(0, true)
    expect(controller.getSnapshot()).toEqual({ progress: 0, target: null })
  })

  it('notifies subscribers with immutable snapshots and removes subscriptions on disposal', () => {
    const listener = vi.fn()
    const initial = controller.getSnapshot()
    const unsubscribe = controller.subscribe(listener)
    controller.set(0.2)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(initial.progress).toBe(0)
    unsubscribe(); controller.set(0.3)
    expect(listener).toHaveBeenCalledTimes(1)
    controller.subscribe(listener); controller.animateTo(1); controller.dispose()
    expect(callbacks.size).toBe(0)
    const count = listener.mock.calls.length
    controller.set(0)
    expect(listener).toHaveBeenCalledTimes(count)
  })
})
