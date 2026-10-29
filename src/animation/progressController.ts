import { clampProgress } from './evaluatePartTransform'

type Snapshot = { progress: number; target: 0 | 1 | null }

/** One progress source for DOM and the renderer; owns at most one animation frame. */
export class ProgressController {
  private snapshot: Snapshot = { progress: 0, target: null }
  private listeners = new Set<() => void>()
  private frame = 0

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private emit(progress: number, target: 0 | 1 | null) {
    this.snapshot = { progress: clampProgress(progress), target }
    this.listeners.forEach(listener => listener())
  }

  set = (progress: number) => {
    this.stopFrame()
    this.emit(progress, null)
  }

  pause = () => {
    this.stopFrame()
    if (this.snapshot.target !== null) this.emit(this.snapshot.progress, null)
  }

  animateTo = (target: 0 | 1, reducedMotion = false) => {
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
    this.listeners.clear()
  }
}
