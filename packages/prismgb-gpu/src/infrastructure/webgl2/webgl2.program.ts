/**
 * WebGL2 shader program wrapper with cached uniform locations.
 *
 * Caches all active uniform locations at construction time to eliminate
 * per-frame `getUniformLocation` string lookups during rendering.
 */
export class ShaderProgram {
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null;
  private readonly uniformLocations: Map<string, WebGLUniformLocation | null>;

  constructor(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string, label: string) {
    this.gl = gl;
    this.uniformLocations = new Map();
    this.program = this.compile(vertexSource, fragmentSource, label);
    this.cacheUniformLocations();
  }

  private compile(vertexSource: string, fragmentSource: string, label: string): WebGLProgram {
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, vertexSource, label);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, fragmentSource, label);

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error(`[${label}] Failed to create program`);
    }

    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`[${label}] Shader link error: ${error}`);
    }

    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    return program;
  }

  private compileShader(type: number, source: string, label: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error(`[${label}] Failed to create shader`);
    }

    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`[${label}] Shader compile error: ${error}`);
    }

    return shader;
  }

  private cacheUniformLocations(): void {
    if (!this.program) return;

    const numUniforms = this.gl.getProgramParameter(this.program, this.gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < numUniforms; i++) {
      const info = this.gl.getActiveUniform(this.program, i);
      if (info) {
        const location = this.gl.getUniformLocation(this.program, info.name);
        this.uniformLocations.set(info.name, location);
      }
    }
  }

  /** Activates this shader program for subsequent draw calls. */
  use(): void {
    this.gl.useProgram(this.program);
  }

  /** Sets an integer uniform. No-op if the uniform is not active. */
  setUniform1i(name: string, value: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform1i(loc, value);
  }

  /** Sets a float uniform. No-op if the uniform is not active. */
  setUniform1f(name: string, value: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform1f(loc, value);
  }

  /** Sets a vec2 float uniform. No-op if the uniform is not active. */
  setUniform2f(name: string, x: number, y: number): void {
    const loc = this.uniformLocations.get(name) ?? null;
    if (loc !== null) this.gl.uniform2f(loc, x, y);
  }

  /** Releases the GPU program and clears cached locations. */
  destroy(): void {
    if (this.program) {
      this.gl.deleteProgram(this.program);
      this.program = null;
    }
    this.uniformLocations.clear();
  }
}
