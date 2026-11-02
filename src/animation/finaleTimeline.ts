import { clampProgress, smootherStep } from './evaluatePartTransform'
import { cinematicEase } from './storyTimeline'

/** The parts close first, the camera settles next, the signature appears last. */
export function evaluateFinale(progress: number, reduced = false) {
  const p = reduced ? 1 : clampProgress(progress)
  return {
    pose: 1 - cinematicEase(clampProgress((p - .06) / .72)),
    camera: cinematicEase(clampProgress(p / .9)),
    signature: smootherStep(clampProgress((p - .91) / .07)),
  }
}
