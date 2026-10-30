import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CameraRig } from '../scene/CameraRig'
import rawParts from '../data/watch-parts.json'
import type { WatchPart } from '../types'
import { createPose, evaluatePartTransform } from './evaluatePartTransform'
import { evaluateStoryPose, storyHolds } from './storyTimeline'

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
})
