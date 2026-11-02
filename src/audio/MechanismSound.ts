export type SoundStatus = 'off' | 'playing' | 'paused' | 'unavailable'
type SoundSnapshot = { enabled: boolean; status: SoundStatus }

/** Short, soft, deterministic mechanical impulses; no downloaded audio. */
export function makeTickSamples(sampleRate: number, alternate = false) {
  const samples = new Float32Array(Math.round(sampleRate * .018))
  let seed = alternate ? 731 : 419
  for (let index = 0; index < samples.length; index++) {
    const t = index / sampleRate
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    const noise = (seed / 4294967296 * 2 - 1)
    const attack = Math.min(1, t / .0009)
    const decay = Math.exp(-t * (alternate ? 510 : 580))
    const tail = Math.max(0, Math.min(1, (.018 - t) / .003))
    samples[index] = attack * decay * tail * (.30 * noise + .48 * Math.sin(t * Math.PI * 2 * (alternate ? 1360 : 1810)))
  }
  return samples
}

/** AudioContext is created only by toggle(), which is called by a user gesture. */
export class MechanismSound {
  private snapshot: SoundSnapshot = { enabled: false, status: 'off' }
  private listeners = new Set<() => void>()
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private buffers: AudioBuffer[] = []
  private sources = new Set<AudioBufferSourceNode>()
  private active = false
  private timer = 0
  private next = 0
  private beat = 0
  private generation = 0
  private disposed = false
  constructor(private createContext: () => AudioContext = () => new AudioContext()) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(enabled: boolean, status: SoundStatus) {
    if (enabled === this.snapshot.enabled && status === this.snapshot.status) return
    this.snapshot = { enabled, status }
    this.listeners.forEach(listener => listener())
  }
  setActive(active: boolean) {
    if (this.active === active) return
    this.active = active
    void this.reconcile()
  }
  toggle = async () => {
    this.publish(!this.snapshot.enabled, this.snapshot.enabled ? 'off' : 'paused')
    if (this.snapshot.enabled) {
      // Unlock even when the user clicks from a text section; later visibility
      // callbacks must not attempt to create a locked context without a gesture.
      try { this.prepareContext(); await this.context!.resume() }
      catch { if (!this.disposed) this.publish(false, 'unavailable'); return }
    }
    await this.reconcile()
  }
  visibilityChanged = () => { void this.reconcile() }
  private cancel() {
    window.clearTimeout(this.timer)
    this.timer = 0
    for (const source of this.sources) { try { source.stop() } catch { /* Already ended. */ } }
    this.sources.clear()
  }
  private prepareContext() {
    if (this.context) return
    this.context = this.createContext()
    this.output = this.context.createGain()
    this.output.gain.value = .075
    this.output.connect(this.context.destination)
    this.buffers = [false, true].map(alternate => {
      const buffer = this.context!.createBuffer(1, Math.round(this.context!.sampleRate * .018), this.context!.sampleRate)
      buffer.copyToChannel(makeTickSamples(this.context!.sampleRate, alternate), 0)
      return buffer
    })
  }
  private async reconcile() {
    const generation = ++this.generation
    this.cancel()
    if (this.disposed) return
    if (!this.snapshot.enabled || !this.active || document.hidden) {
      this.publish(this.snapshot.enabled, this.snapshot.enabled ? 'paused' : 'off')
      try { if (this.context?.state === 'running') await this.context.suspend() } catch { /* Playback remains stopped. */ }
      return
    }
    try {
      this.prepareContext()
      await this.context!.resume()
      if (this.disposed || generation !== this.generation) {
        // A late resume must not leave the audio thread running after a rapid
        // mute/visibility change, even though all sample sources were cancelled.
        if ((!this.snapshot.enabled || !this.active || document.hidden) && this.context?.state === 'running') void this.context.suspend().catch(() => {})
        return
      }
      this.next = this.context!.currentTime + .045
      this.publish(true, 'playing')
      this.schedule()
    } catch {
      if (generation === this.generation && !this.disposed) this.publish(false, 'unavailable')
    }
  }
  private schedule = () => {
    if (!this.context || !this.output || this.disposed || !this.snapshot.enabled || !this.active || document.hidden) return
    // The audio clock handles samples independently of expensive WebGL frames.
    const now = this.context.currentTime
    if (this.next < now) this.next = now + .02
    while (this.next < now + .4) {
      const source = this.context.createBufferSource()
      source.buffer = this.buffers[this.beat++ % 2]
      source.connect(this.output)
      source.onended = () => { this.sources.delete(source); source.disconnect() }
      this.sources.add(source)
      source.start(this.next)
      this.next += .5
    }
    this.timer = window.setTimeout(this.schedule, 125)
  }
  dispose() {
    this.disposed = true
    this.generation++
    this.cancel()
    this.output?.disconnect()
    void this.context?.close().catch(() => {})
    this.context = null
    this.buffers = []
    this.listeners.clear()
  }
}
