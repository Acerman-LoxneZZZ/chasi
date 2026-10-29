import { clampProgress } from './evaluatePartTransform'

type Snapshot = { progress: number; target: 0 | 1 | null }

export interface ProgressOwner {
  seek: (progress: number) => void
  animate: (target: 0 | 1, reducedMotion: boolean) => void
  pause: () => void
}

/** One progress source for DOM and the renderer; owns at most one animation frame. */
export class ProgressController {
  private snapshot: Snapshot = { progress: 0, target: null }
  private listeners = new Set<() => void>()
  private frame = 0
  private owner: ProgressOwner | null = null

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(progress: number, target: 0 | 1 | null) {
    progress = clampProgress(progress)
    if (progress === this.snapshot.progress && target === this.snapshot.target) return
    this.snapshot = { progress, target }
    this.listeners.forEach(listener => listener())
  }

  /** The scroll coordinator owns input in story mode; no second progress animation. */
  attachOwner(owner: ProgressOwner | null) { this.stopFrame(); this.owner = owner }
  commit = (progress: number, target: 0 | 1 | null = null) => this.emit(progress, target)

  set = (progress: number) => {
    if (this.owner) { this.owner.seek(clampProgress(progress)); return }
    this.stopFrame()
    this.emit(progress, null)
  }

  pause = () => {
    if (this.owner) { this.owner.pause(); return }
    this.stopFrame()
    if (this.snapshot.target !== null) this.emit(this.snapshot.progress, null)
  }

  animateTo = (target: 0 | 1, reducedMotion = false) => {
    if (this.owner) { this.owner.animate(target, reducedMotion); return }
    this.stopFrame()
    if (reducedMotion || target === this.snapshot.progress) {
      this.emit(target, null)
      return
    }
    const from = this.snapshot.progress
    const duration = Math.abs(target - from) * 9000
    let startedAt: number | null = null
    this.emit(from, target)
    const tick = (time: number) => {
      if (this.snapshot.target === null) return
      if (typeof document !== 'undefined' && document.hidden) {
        this.pause()
        return
      }
      startedAt ??= time
      const elapsed = clampProgress((time - startedAt) / duration)
      if (elapsed === 1) {
        this.frame = 0
        this.emit(target, null)
        return
      }
      this.emit(from + (target - from) * elapsed, target)
      if (this.snapshot.target === target) this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  private stopFrame() {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  dispose = () => {
    this.stopFrame()
    this.owner = null
    this.listeners.clear()
  }
}
