import { describe, expect, it } from 'vitest'
import rawParts from '../data/watch-parts.json'
import type { WatchPart } from '../types'
import { createPose, evaluatePartTransform, validateParts } from './evaluatePartTransform'

const parts = rawParts as WatchPart[]

describe('actual exported watch manifest', () => {
  it('contains valid, independently identified and documented parts', () => {
    expect(() => validateParts(parts)).not.toThrow()
    expect(new Set(parts.map(part => part.id)).size).toBe(parts.length)
    expect(parts.length).toBeGreaterThanOrEqual(24)
    expect(parts.every(part => part.title && part.description && part.materialLabel)).toBe(true)
  })

  it('keeps every real part finite, reversible and deterministic over the full range', () => {
    const source = structuredClone(parts)
    const out = createPose()
    for (const part of parts) {
      const rest = { position: part.restPosition, quaternion: part.restQuaternion, scale: part.restScale }
      expect(evaluatePartTransform(part, 0, out)).toEqual(rest)
      for (let index = 0; index <= 40; index++) {
        evaluatePartTransform(part, index / 40, out)
        expect([...out.position, ...out.quaternion, ...out.scale].every(Number.isFinite)).toBe(true)
        expect(Math.hypot(...out.quaternion)).toBeCloseTo(1, 6)
      }
      const targetPosition = part.restPosition.map((value, index) => value + part.explodedOffset[index])
      expect(evaluatePartTransform(part, 1, out).position).toEqual(targetPosition)
      for (const progress of [0, 1, 0.01, 0.99, 0.5, 0.2, 0.9, 0]) evaluatePartTransform(part, progress, out)
      expect(out).toEqual(rest)
    }
    expect(parts).toEqual(source)
  })
})
