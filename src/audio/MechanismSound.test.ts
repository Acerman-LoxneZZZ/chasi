import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTickSamples, MechanismSound } from './MechanismSound'

const setup = () => {
  vi.useFakeTimers()
  vi.stubGlobal('window', { setTimeout, clearTimeout })
  const doc={ hidden:false }; vi.stubGlobal('document',doc)
  const sources: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[]=[]
  const context={ state:'suspended', currentTime:0, sampleRate:48000, destination:{},
    createGain:()=>({gain:{value:0},connect:vi.fn(),disconnect:vi.fn()}),
    createBuffer:()=>({copyToChannel:vi.fn()}),
    createBufferSource:()=>{const s={start:vi.fn(),stop:vi.fn(),connect:vi.fn(),disconnect:vi.fn(),onended:null};sources.push(s);return s},
    resume:vi.fn(async()=>{context.state='running'}), suspend:vi.fn(async()=>{context.state='suspended'}),close:vi.fn(async()=>{context.state='closed'}),
  }
  const factory=vi.fn(()=>context as unknown as AudioContext)
  const sound=new MechanismSound(factory)
  return {sound,context,factory,doc,sources}
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
describe('opt-in mechanical sound',()=>{
  it('creates no context or sound before the explicit user action',()=>{
    const {sound,factory}=setup();sound.setActive(true)
    expect(factory).not.toHaveBeenCalled();expect(sound.getSnapshot()).toEqual({enabled:false,status:'off'});sound.dispose()
  })
  it('plays only after enable, cancels all scheduled samples on mute, and can restart',async()=>{
    const {sound,factory,sources}=setup();sound.setActive(true);await sound.toggle()
    expect(factory).toHaveBeenCalledTimes(1);expect(sound.getSnapshot().status).toBe('playing');expect(sources[0].start).toHaveBeenCalled()
    await sound.toggle();expect(sound.getSnapshot()).toEqual({enabled:false,status:'off'});expect(sources[0].stop).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0);await sound.toggle();expect(factory).toHaveBeenCalledTimes(1);sound.dispose();expect(vi.getTimerCount()).toBe(0)
  })
  it('unlocks from a text section but stays silent offscreen and in a hidden tab',async()=>{
    const {sound,factory,doc,context}=setup();await sound.toggle()
    expect(factory).toHaveBeenCalledTimes(1);expect(sound.getSnapshot().status).toBe('paused')
    sound.setActive(true);await Promise.resolve();await Promise.resolve();expect(sound.getSnapshot().status).toBe('playing')
    doc.hidden=true;sound.visibilityChanged();await Promise.resolve();expect(sound.getSnapshot().status).toBe('paused');expect(vi.getTimerCount()).toBe(0)
    doc.hidden=false;sound.visibilityChanged();await Promise.resolve();await Promise.resolve();expect(sound.getSnapshot().status).toBe('playing')
    sound.dispose();expect(context.close).toHaveBeenCalled()
  })
  it('handles unsupported audio without an unhandled rejection or enabled state',async()=>{
    setup();const sound=new MechanismSound(()=>{throw new Error('Unsupported')});sound.setActive(true);await sound.toggle()
    expect(sound.getSnapshot()).toEqual({enabled:false,status:'unavailable'});expect(vi.getTimerCount()).toBe(0);sound.dispose()
  })
  it('synthesizes bounded short impulses with no clipping and distinct tick/tock',()=>{
    const a=makeTickSamples(48000),b=makeTickSamples(48000,true)
    expect(a.length).toBe(864);expect(Math.abs(a[0])).toBe(0)
    expect(Math.max(...a.map(Math.abs))).toBeLessThan(1)
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(.1)
    expect(Math.abs(a.at(-1)!)).toBeLessThan(.001)
    expect(a).not.toEqual(b)
  })
})
