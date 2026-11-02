import { clampProgress, smootherStep } from './evaluatePartTransform'

/** A camera-travel curve: soft acceleration, a long steady glide, soft braking.
 * Its peak speed is 1.25× the average, instead of quintic's 1.875×. Position,
 * velocity and acceleration join exactly; it remains an absolute scroll mapping.
 */
export function cinematicEase(value: number) {
  const t = clampProgress(value)
  const ramp = .2
  const integral = (u: number) => u ** 4 * (2.5 + u * (-3 + u))
  if (t < ramp) return ramp * integral(t / ramp) / (1 - ramp)
  if (t > 1 - ramp) return 1 - ramp * integral((1 - t) / ramp) / (1 - ramp)
  return (t - ramp / 2) / (1 - ramp)
}

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
      const eased = cinematicEase((p - hold.end) / (next.start - hold.end))
      return hold.pose + (next.pose - hold.pose) * eased
    }
  }
  return 1
}

/** Captions live entirely inside still frames. The opening is the object alone. */
export function storyCaptionOpacity(progress: number) {
  const p = clampProgress(progress)
  for (const hold of storyHolds.slice(1)) {
    if (p < hold.start || p > hold.end) continue
    const enter = smootherStep(clampProgress((p - hold.start) / .009))
    const leave = hold.end === 1 ? 1 : smootherStep(clampProgress((hold.end - p) / .009))
    return enter * leave
  }
  return 0
}
