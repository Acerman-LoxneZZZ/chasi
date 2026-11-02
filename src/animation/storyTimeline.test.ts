import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CameraRig, evaluateStoryCameraAngles } from '../scene/CameraRig'
import rawParts from '../data/watch-parts.json'
import type { WatchPart } from '../types'
import { createPose, evaluatePartTransform } from './evaluatePartTransform'
import { cinematicEase, evaluateStoryPose, storyCaptionOpacity, storyHolds } from './storyTimeline'

const parts = rawParts as WatchPart[]

describe('product story stops', () => {
  it('keeps every part and the camera completely still throughout each reading hold', () => {
    const camera = new PerspectiveCamera(33, 1, .1, 100)
    const controls = { target: new Vector3(), addEventListener: vi.fn(), removeEventListener: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), update: vi.fn() } as unknown as OrbitControls
    const rig = new CameraRig(camera, controls)
    const points: Vector3[] = []
    for (const x of [-1.42, 1.42]) for (const y of [-1.42, 2.32]) for (const z of [-.4, .45]) points.push(new Vector3(x, y, z))
    const focus = new Vector3(.3, .2, .1)
    for (const mobile of [false, true]) {
      for (const hold of storyHolds) {
        const expectedParts = parts.map(part => evaluatePartTransform(part, hold.pose, createPose(), mobile))
        rig.frame(hold.pose, mobile ? 390 : 1440, mobile ? 844 : 1000, points, false, focus)
        const expectedCamera = { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray() }
        for (let index = 0; index <= 12; index++) {
          const scroll = index === 12 ? hold.end : hold.start + (hold.end - hold.start) * index / 12
          const pose = evaluateStoryPose(scroll)
          expect(pose).toBe(hold.pose)
          expect(parts.map(part => evaluatePartTransform(part, pose, createPose(), mobile))).toEqual(expectedParts)
          rig.frame(pose, mobile ? 390 : 1440, mobile ? 844 : 1000, points, false, focus)
          expect({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: controls.target.toArray() }).toEqual(expectedCamera)
        }
      }
    }
  })

  it('advances monotonically between stops without overshoot and returns exactly on reverse scroll', () => {
    let previous = 0
    const forward = Array.from({ length: 1001 }, (_, index) => {
      const value = evaluateStoryPose(index / 1000)
      expect(value).toBeGreaterThanOrEqual(previous)
      expect(value).toBeLessThanOrEqual(1)
      previous = value
      return value
    })
    for (let index = 1000; index >= 0; index--) expect(evaluateStoryPose(index / 1000)).toBe(forward[index])
    expect(evaluateStoryPose(0)).toBe(0)
    expect(evaluateStoryPose(1)).toBe(1)
  })

  it('spreads the complete camera turn without a compound-easing angular-speed spike', () => {
    const samples = 10000
    for (const mobile of [false, true]) {
      let previous = evaluateStoryCameraAngles(evaluateStoryPose(0), mobile).yaw
      let peakDegreesPerProgress = 0
      for (let index = 1; index <= samples; index++) {
        const angle = evaluateStoryCameraAngles(evaluateStoryPose(index / samples), mobile).yaw
        peakDegreesPerProgress = Math.max(peakDegreesPerProgress, (angle - previous) * samples * 180 / Math.PI)
        previous = angle
      }
      // The same complete orbit now stays below 19° per 1% of scroll, down
      // from 28° with quintic travel. There is no second visual follower.
      expect(peakDegreesPerProgress).toBeLessThan(1900)
    }
  })

  it('eases velocity and acceleration into both edges of every held pose', () => {
    const epsilon = 1e-5
    for (const hold of storyHolds) {
      for (const boundary of [hold.start, hold.end]) {
        if (boundary === 0 || boundary === 1) continue
        const left = evaluateStoryPose(boundary - epsilon)
        const center = evaluateStoryPose(boundary)
        const right = evaluateStoryPose(boundary + epsilon)
        expect(Math.abs((right - left) / (2 * epsilon))).toBeLessThan(1e-5)
        expect(Math.abs((right - 2 * center + left) / epsilon ** 2)).toBeLessThan(.1)
      }
    }
  })

  it('clamps invalid and out-of-range scroll while keeping the two endpoint configurations exact', () => {
    for (const value of [-100, -1, NaN, Infinity, -Infinity]) expect(evaluateStoryPose(value)).toBe(0)
    for (const value of [1, 2, 100]) expect(evaluateStoryPose(value)).toBe(1)
    expect(parts.map(part => evaluatePartTransform(part, evaluateStoryPose(0)))).toEqual(parts.map(part => evaluatePartTransform(part, 0)))
    expect(parts.map(part => evaluatePartTransform(part, evaluateStoryPose(1)))).toEqual(parts.map(part => evaluatePartTransform(part, 1)))
  })
  it('shows captions only when all parts and the camera are held, leaving the entire intro and every flight clear', () => {
    for (let index = 0; index <= 10000; index++) {
      const p = index / 10000
      const opacity = storyCaptionOpacity(p)
      expect(opacity).toBeGreaterThanOrEqual(0)
      expect(opacity).toBeLessThanOrEqual(1)
      if (opacity > 0) {
        const hold = storyHolds.find(hold => p >= hold.start && p <= hold.end)!
        expect(hold).toBeDefined()
        expect(hold.pose).toBeGreaterThan(0)
        expect(evaluateStoryPose(p)).toBe(hold.pose)
      }
    }
    for (const p of [0, .04, .16, .405, .67, .9]) expect(storyCaptionOpacity(p)).toBe(0)
    for (const p of [.28, .53, .78, .97, 1]) expect(storyCaptionOpacity(p)).toBe(1)
  })
  it('keeps a steady cruise with smooth joins and one-third lower peak speed', () => {
    const epsilon = 1e-5
    for (const t of [0, .2, .5, .8, 1]) {
      expect(cinematicEase(1 - t)).toBeCloseTo(1 - cinematicEase(t), 12)
      const acceleration = (cinematicEase(t + epsilon) - 2 * cinematicEase(t) + cinematicEase(t - epsilon)) / epsilon ** 2
      expect(Math.abs(acceleration)).toBeLessThan(.001)
    }
    for (const t of [.3, .5, .7]) expect((cinematicEase(t + epsilon) - cinematicEase(t - epsilon)) / (2 * epsilon)).toBeCloseTo(1.25, 9)
    expect(cinematicEase(NaN)).toBe(0)
    expect(cinematicEase(-1)).toBe(0)
    expect(cinematicEase(2)).toBe(1)
  })
})
