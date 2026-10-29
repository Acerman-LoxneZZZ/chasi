import { clampProgress } from './evaluatePartTransform'

/** A render-only, critically damped follower. It never owns a clock or changes canonical progress. */
export class RenderProgressFollower {
  private value = 0
  private destination = 0
  private velocity = 0
  private sampledAt = 0
  private settleAt = 0

  get current() { return this.value }
  get target() { return this.destination }
  get moving() { return this.value !== this.destination }

  reset(progress: number, time: number) {
    this.value = this.destination = clampProgress(progress)
    this.velocity = 0
    this.sampledAt = this.settleAt = time
    return this.value
  }

  follow(progress: number, time: number, immediate = false) {
    if (immediate) return this.reset(progress, time)
    this.sample(time)
    const target = clampProgress(progress)
    if (target === this.destination) return this.value
    // A reversed scroll must never continue travelling away from the new target.
    if ((target - this.value) * this.velocity < 0) this.velocity = 0
    this.destination = target
    this.settleAt = time + 100
    if (target === this.value) this.velocity = 0
    return this.value
  }

  sample(time: number) {
    if (!this.moving || time >= this.settleAt) return this.reset(this.destination, time)
    const elapsed = Math.max(0, time - this.sampledAt) / 1000
    this.sampledAt = Math.max(this.sampledAt, time)
    const from = this.value
    const error = from - this.destination
    const angularFrequency = 90
    const blend = this.velocity + angularFrequency * error
    const decay = Math.exp(-angularFrequency * elapsed)
    const next = this.destination + (error + blend * elapsed) * decay
    this.velocity = (this.velocity - angularFrequency * blend * elapsed) * decay
    this.value = Math.max(Math.min(from, this.destination), Math.min(Math.max(from, this.destination), next))
    if (this.value === this.destination) this.velocity = 0
    return this.value
  }
}
