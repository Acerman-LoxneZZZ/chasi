import { describe, expect, it } from 'vitest'
import { RenderProgressFollower } from './renderProgress'

describe('short render-only progress smoothing', () => {
  it('keeps intermediate frames continuous and reaches an exact endpoint in 100ms', () => {
    const follower = new RenderProgressFollower()
    follower.reset(0, 0)
    follower.follow(1, 0)
    expect(follower.sample(0)).toBe(0)
    const first = follower.sample(16)
    const second = follower.sample(32)
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(second)
    expect(second).toBeLessThan(1)
    expect(follower.moving).toBe(true)
    expect(follower.sample(100)).toBe(1)
    expect(follower.moving).toBe(false)
    expect(follower.sample(5000)).toBe(1)
  })
  it('retargets one live destination rather than accumulating queued passages', () => {
    const follower = new RenderProgressFollower()
    follower.reset(0, 0)
    for (let i = 1; i <= 50; i++) follower.follow(i / 50, i * 5)
    expect(follower.target).toBe(1)
    expect(follower.current).toBeLessThan(1)
    expect(follower.sample(349)).toBeLessThan(1)
    expect(follower.sample(350)).toBe(1)
    expect(follower.moving).toBe(false)
  })
  it('reverses without overshoot, old momentum or residual drift', () => {
    const follower = new RenderProgressFollower()
    follower.reset(0, 0)
    follower.follow(1, 0)
    const peak = follower.sample(25)
    follower.follow(0, 25)
    let previous = peak
    for (let time = 30; time <= 125; time += 5) {
      const current = follower.sample(time)
      expect(current).toBeGreaterThanOrEqual(0)
      expect(current).toBeLessThanOrEqual(previous)
      previous = current
    }
    expect(follower.current).toBe(0)
    expect(follower.sample(10000)).toBe(0)
  })
  it('sets manual, reduced-motion and restored configurations directly', () => {
    const follower = new RenderProgressFollower()
    follower.follow(1, 0)
    follower.sample(20)
    expect(follower.follow(.63, 25, true)).toBe(.63)
    expect(follower.current).toBe(.63)
    expect(follower.moving).toBe(false)
    expect(follower.sample(50000)).toBe(.63)
    expect(follower.reset(0, 50010)).toBe(0)
  })
  it('does not resume elapsed hidden-tab time or a stale destination', () => {
    const follower = new RenderProgressFollower()
    follower.follow(.8, 0)
    follower.sample(20)
    follower.reset(.8, 25)
    expect(follower.sample(60000)).toBe(.8)
    follower.follow(.2, 60000)
    expect(follower.sample(60100)).toBe(.2)
  })
  it('clamps invalid targets and safely settles when frame delivery is sparse', () => {
    const follower = new RenderProgressFollower()
    follower.reset(.2, 0)
    follower.follow(10, 0)
    expect(follower.sample(1500)).toBe(1)
    expect(follower.follow(NaN, 1500, true)).toBe(0)
    expect(follower.follow(-2, 1501, true)).toBe(0)
    expect(follower.moving).toBe(false)
  })
})
