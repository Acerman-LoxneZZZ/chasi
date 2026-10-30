import { clampProgress, smootherStep } from './evaluatePartTransform'

/** Scroll intervals held still long enough to read the product characteristics. */
export const storyHolds = [
  { start: 0, end: .06, pose: 0 },
  { start: .25, end: .30, pose: .22 },
  { start: .51, end: .56, pose: .46 },
  { start: .75, end: .80, pose: .75 },
  { start: .96, end: 1, pose: 1 },
] as const

/**
 * Canonical progress remains the document/range position. Only the visual pose
 * is remapped, identically in story and manual modes, so switching owners cannot
 * move the parts or reinterpret a saved progress value.
 */
export function evaluateStoryPose(progress: number) {
  const p = clampProgress(progress)
  for (let index = 0; index < storyHolds.length; index++) {
    const hold = storyHolds[index]
    if (p <= hold.end) return hold.pose
    const next = storyHolds[index + 1]
    if (next && p < next.start) {
      const eased = smootherStep(clampProgress((p - hold.end) / (next.start - hold.end)))
      return hold.pose + (next.pose - hold.pose) * eased
    }
  }
  return 1
}
