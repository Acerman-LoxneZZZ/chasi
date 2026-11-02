import { describe, expect, it } from 'vitest'
import { evaluateFinale } from './finaleTimeline'
import { evaluatePartTransform } from './evaluatePartTransform'
import rawParts from '../data/watch-parts.json'
import type { WatchPart } from '../types'

describe('closing the same watch', () => {
  it('starts fully exploded and returns all 47 carriers to their exact exported rest TRS', () => {
    expect(evaluateFinale(0).pose).toBe(1)
    expect(evaluateFinale(1).pose).toBe(0)
    for (const part of rawParts as WatchPart[]) {
      const pose = evaluatePartTransform(part, evaluateFinale(1).pose)
      expect(pose.position).toEqual(part.restPosition)
      expect(pose.quaternion).toEqual(part.restQuaternion)
      expect(pose.scale).toEqual(part.restScale)
    }
  })
  it('assembles monotonically, settles the camera, then reveals the signature with no overlapping motion', () => {
    let previous = 1
    for (let index=0; index<=1000; index++) {
      const frame = evaluateFinale(index/1000)
      expect(frame.pose).toBeLessThanOrEqual(previous)
      previous = frame.pose
      if (frame.signature>0) { expect(frame.pose).toBe(0); expect(frame.camera).toBe(1) }
    }
  })
  it('is absolute and reversible and offers a completed static reduced-motion composition', () => {
    const expected = evaluateFinale(.42)
    for (const p of [0,1,.2,.8,.42]) evaluateFinale(p)
    expect(evaluateFinale(.42)).toEqual(expected)
    expect(evaluateFinale(NaN)).toEqual(evaluateFinale(0))
    expect(evaluateFinale(4)).toEqual(evaluateFinale(1))
    for (const p of [0,.2,.9,1]) expect(evaluateFinale(p,true)).toEqual({pose:0,camera:1,signature:1})
  })
})
