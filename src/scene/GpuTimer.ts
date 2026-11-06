/** Non-blocking GPU samples. renderer.render() measures command submission on
 * the CPU; waiting for QUERY_RESULT would itself cause the hitch we avoid. */
export class GpuTimer {
  private extension: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null
  private pending: WebGLQuery[] = []
  private active: WebGLQuery | null = null
  private gl: WebGL2RenderingContext
  constructor(context: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = context as WebGL2RenderingContext
    this.extension = typeof this.gl.beginQuery === 'function' ? this.gl.getExtension('EXT_disjoint_timer_query_webgl2') : null
  }
  sample(): number | null {
    const { gl, extension } = this
    if (!extension || gl.isContextLost()) return null
    if (gl.getParameter(extension.GPU_DISJOINT_EXT)) { this.dispose(); return null }
    const query = this.pending[0]
    if (!query || !gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return null
    const milliseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
    this.pending.shift()
    gl.deleteQuery(query)
    return milliseconds
  }
  begin() {
    if (!this.extension || this.active || this.pending.length >= 3 || this.gl.isContextLost()) return
    this.active = this.gl.createQuery()
    if (this.active) this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active)
  }
  end() {
    if (!this.active || !this.extension) return
    if (!this.gl.isContextLost()) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT)
      this.pending.push(this.active)
    }
    this.active = null
  }
  dispose() {
    if (this.active && this.extension && !this.gl.isContextLost()) this.gl.endQuery(this.extension.TIME_ELAPSED_EXT)
    if (this.active) this.gl.deleteQuery(this.active)
    this.pending.forEach(query => this.gl.deleteQuery(query))
    this.pending = []
    this.active = null
  }
}
