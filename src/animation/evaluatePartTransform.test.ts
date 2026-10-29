import { describe, expect, it } from 'vitest'
import { clampProgress, createPose, evaluatePartTransform, smootherStep, validateParts } from './evaluatePartTransform'
import type { WatchPart } from '../types'

const base: WatchPart = {
  id: 'gear_test', nodeName: 'gear_test', title: 'Колесо', description: 'Передаёт движение.',
  materialLabel: 'Латунь', category: 'movement', start: 0.2, end: 0.8,
  restPosition: [0.25, -0.3, 0.1], explodedOffset: [0.7, 0.4, 1.6],
  restQuaternion: [0, 0, 0, 1], explodedQuaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
  restScale: [1, 1.2, 0.8], labelAnchor: [0, 0.1, 0.05], selectable: true,
}

const parts = () => Array.from({ length: 24 }, (_, index) => ({ ...structuredClone(base), id: `part_${index}`, nodeName: `part_${index}` }))

describe('absolute exploded-view transforms', () => {
  it('uses a separate mobile spacing without scaling geometry or changing rest poses', () => {
    const part = { ...base, mobileOffset: [.2, .3, .7] as WatchPart['mobileOffset'] }
    expect(evaluatePartTransform(part, 0, createPose(), true)).toEqual(evaluatePartTransform(part, 0))
    evaluatePartTransform(part, 1, createPose(), true).position.forEach((value, index) => expect(value).toBeCloseTo([.45, 0, .8][index], 12))
    expect(evaluatePartTransform(part, .6, createPose(), true).scale).toEqual(base.restScale)
  })
  it('evaluates multi-turn wheel rotations absolutely and reverses them without drift', () => {
    const part = { ...base, spinTurns: 3, explodedQuaternion: base.restQuaternion }
    const quarter = .2 + .6 * .25
    const pose = evaluatePartTransform(part, quarter)
    expect(Math.abs(pose.quaternion[2])).toBeGreaterThan(.1)
    const expected = structuredClone(pose)
    for (const p of [1, 0, .8, .32, 1, .21, quarter]) evaluatePartTransform(part, p, pose)
    expect(pose).toEqual(expected)
    expect(evaluatePartTransform(part, 0).quaternion).toEqual(base.restQuaternion)
  })
  it('restores the exact exported position, quaternion and scale at zero and before the range', () => {
    for (const progress of [-100, 0, 0.1, 0.2]) {
      const pose = evaluatePartTransform(base, progress)
      expect(pose).toEqual({ position: base.restPosition, quaternion: base.restQuaternion, scale: base.restScale })
    }
  })

  it('reaches the exact target at the end and clamps out-of-range values', () => {
    for (const progress of [0.8, 0.9, 1, 100]) {
      expect(evaluatePartTransform(base, progress)).toEqual({
        position: base.restPosition.map((value, index) => value + base.explodedOffset[index]),
        quaternion: base.explodedQuaternion,
        scale: base.restScale,
      })
    }
  })

  it('interpolates the local interval with quintic smootherstep and quaternion slerp', () => {
    const pose = evaluatePartTransform(base, 0.5)
    base.restPosition.forEach((value, index) => expect(pose.position[index]).toBeCloseTo(value + base.explodedOffset[index] / 2, 12))
    expect(pose.quaternion[1]).toBeCloseTo(Math.sin(Math.PI / 8), 12)
    expect(pose.quaternion[3]).toBeCloseTo(Math.cos(Math.PI / 8), 12)
    expect(Math.hypot(...pose.quaternion)).toBeCloseTo(1, 12)
  })

  it('eases acceleration as well as velocity into the edges of a local interval', () => {
    const epsilon = 1e-4
    expect(smootherStep(0)).toBe(0)
    expect(smootherStep(.5)).toBe(.5)
    expect(smootherStep(1)).toBe(1)
    // A cubic-sized displacement near either edge gives zero first and second derivatives.
    expect(smootherStep(epsilon)).toBeLessThan(11 * epsilon ** 3)
    expect(1 - smootherStep(1 - epsilon)).toBeLessThan(11 * epsilon ** 3)
    const p = base.start + (base.end - base.start) * .25
    const pose = evaluatePartTransform(base, p)
    base.restPosition.forEach((value, index) => expect(pose.position[index]).toBeCloseTo(value + base.explodedOffset[index] * .103515625, 12))
  })

  it('takes the shortest rotation when destination quaternions have a negative dot product', () => {
    const negativeDotPart: WatchPart = { ...base, explodedQuaternion: [0, Math.SQRT1_2, 0, -Math.SQRT1_2] }
    const pose = evaluatePartTransform(negativeDotPart, 0.5)
    expect(pose.quaternion[1]).toBeCloseTo(-Math.sin(Math.PI / 8), 12)
    expect(pose.quaternion[3]).toBeCloseTo(Math.cos(Math.PI / 8), 12)
  })

  it('handles antipodal and almost parallel quaternions without a zero denominator', () => {
    for (const explodedQuaternion of [[0, 0, 0, -1], [0, Math.sin(0.00001), 0, Math.cos(0.00001)]] as WatchPart['explodedQuaternion'][]) {
      for (let index = 0; index <= 100; index++) {
        const pose = evaluatePartTransform({ ...base, explodedQuaternion }, index / 100)
        expect(pose.quaternion.every(Number.isFinite)).toBe(true)
        expect(Math.hypot(...pose.quaternion)).toBeCloseTo(1, 12)
      }
    }
  })

  it('does not drift after repeated arbitrary forward and backward trajectories', () => {
    const target = createPose()
    const expectedMiddle = evaluatePartTransform(base, 0.37)
    const trajectories = [0, 1, 0, 0.5, 0.2, 0.9, 0, 1, 0.01, 0.99, 0]
    for (let loop = 0; loop < 100; loop++) {
      trajectories.forEach(progress => evaluatePartTransform(base, progress, target))
      expect(target).toEqual({ position: base.restPosition, quaternion: base.restQuaternion, scale: base.restScale })
      expect(evaluatePartTransform(base, 0.37, target)).toEqual(expectedMiddle)
    }
  })

  it('reuses the supplied output buffers and preserves all source data', () => {
    const original = structuredClone(base)
    const out = createPose()
    const position = out.position, quaternion = out.quaternion, scale = out.scale
    expect(evaluatePartTransform(base, 0.4, out)).toBe(out)
    expect(out.position).toBe(position)
    expect(out.quaternion).toBe(quaternion)
    expect(out.scale).toBe(scale)
    expect(base).toEqual(original)
  })

  it('keeps explicitly stationary parts fixed at all progress values', () => {
    const stationary: WatchPart = { ...base, start: 0, end: 0, explodedOffset: [0, 0, 0], explodedQuaternion: base.restQuaternion }
    for (const progress of [0, 0.1, 0.5, 1]) expect(evaluatePartTransform(stationary, progress).position).toEqual(base.restPosition)
  })

  it('produces finite poses and normalized quaternions over the complete continuous range', () => {
    for (let index = 0; index <= 1000; index++) {
      const pose = evaluatePartTransform(base, index / 1000)
      expect([...pose.position, ...pose.quaternion, ...pose.scale].every(Number.isFinite)).toBe(true)
      expect(Math.hypot(...pose.quaternion)).toBeCloseTo(1, 12)
    }
    for (const progress of [NaN, Infinity, -Infinity]) expect(evaluatePartTransform(base, progress)).toEqual(evaluatePartTransform(base, 0))
    expect([clampProgress(-1), clampProgress(0.36), clampProgress(4)]).toEqual([0, 0.36, 1])
  })
})

describe('manifest validation', () => {
  it('accepts a valid set of separately named parts', () => expect(() => validateParts(parts())).not.toThrow())

  it('rejects insufficient or duplicate nodes before rendering', () => {
    expect(() => validateParts(parts().slice(0, 23))).toThrow(/24/)
    const duplicate = parts(); duplicate[1].nodeName = duplicate[0].nodeName
    expect(() => validateParts(duplicate)).toThrow(/Повторяющееся/)
  })

  it('rejects nonfinite coordinates, unnormalized rotations and nonpositive scales', () => {
    const cases = parts(); cases[0].explodedOffset[2] = NaN
    expect(() => validateParts(cases)).toThrow(/координаты/)
    const rotation = parts(); rotation[0].restQuaternion = [0, 0, 0, 2]
    expect(() => validateParts(rotation)).toThrow(/Quaternion/)
    const scale = parts(); scale[0].restScale[1] = -1
    expect(() => validateParts(scale)).toThrow(/масштаб/)
  })

  it('rejects reversed or out-of-bounds intervals and moving parts with an empty range', () => {
    for (const [start, end] of [[0.8, 0.2], [-0.1, 0.5], [0.5, 1.1], [0.5, 0.5]]) {
      const invalid = parts(); invalid[0].start = start; invalid[0].end = end
      expect(() => validateParts(invalid)).toThrow()
    }
  })
})
