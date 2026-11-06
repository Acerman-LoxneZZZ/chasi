import { describe, expect, it, vi } from 'vitest'
import { GpuTimer } from './GpuTimer'

function context(supported = true) {
  let available = false, lost = false, disjoint = false
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
    getExtension: () => supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    isContextLost: () => lost, getParameter: () => disjoint,
    createQuery: vi.fn(() => ({})), beginQuery: vi.fn(), endQuery: vi.fn(), deleteQuery: vi.fn(),
    getQueryParameter: vi.fn((_query: WebGLQuery, key: number) => key === 1 ? available : 25_000_000),
  }
  return { gl, timer: new GpuTimer(gl as unknown as WebGL2RenderingContext),
    ready: () => { available = true }, lose: () => { lost = true }, disjoint: () => { disjoint = true } }
}

describe('GPU timing without blocking the scroll thread', () => {
  it('never requests a GPU result until it is available, then converts nanoseconds to milliseconds', () => {
    const { timer, gl, ready } = context()
    timer.begin(); timer.end()
    expect(timer.sample()).toBe(null)
    expect(gl.getQueryParameter.mock.calls.map(call => call[1])).not.toContain(gl.QUERY_RESULT)
    ready()
    expect(timer.sample()).toBe(25)
    expect(gl.deleteQuery).toHaveBeenCalledTimes(1)
    expect(timer.sample()).toBe(null)
  })
  it('bounds outstanding work when the GPU falls behind instead of accumulating queries', () => {
    const { timer, gl } = context()
    for (let frame = 0; frame < 100; frame++) { timer.begin(); timer.end() }
    expect(gl.createQuery).toHaveBeenCalledTimes(3)
    timer.dispose()
    expect(gl.deleteQuery).toHaveBeenCalledTimes(3)
  })
  it('discards disjoint results and does not touch a lost context', () => {
    const first = context()
    first.timer.begin(); first.timer.end(); first.disjoint(); first.ready()
    expect(first.timer.sample()).toBe(null)
    expect(first.gl.getQueryParameter).not.toHaveBeenCalled()
    expect(first.gl.deleteQuery).toHaveBeenCalledTimes(1)
    const second = context()
    second.lose(); second.timer.begin(); second.timer.end()
    expect(second.timer.sample()).toBe(null)
    expect(second.gl.createQuery).not.toHaveBeenCalled()
    expect(second.gl.getQueryParameter).not.toHaveBeenCalled()
  })
  it('keeps rendering possible when the timing extension is unavailable', () => {
    const { timer, gl } = context(false)
    timer.begin(); timer.end(); timer.dispose()
    expect(timer.sample()).toBe(null)
    expect(gl.createQuery).not.toHaveBeenCalled()
  })
})
