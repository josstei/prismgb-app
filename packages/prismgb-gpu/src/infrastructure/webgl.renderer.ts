import { BasePipeline } from './pipeline-base';
import { loadWebGlShaders } from './shaders';
import { RecoverableBackendInitializationError } from '../domain/errors';
import type { PipelineUniforms } from '../domain/uniforms';
import {
  compileRenderPasses,
  createRenderPassPlan,
  getEnabledRenderPasses,
  getManifestRecord,
  getManifestString,
  isRecord,
  normalizeUniformValueSource,
  readFiniteNumber,
  readFiniteNumberPair,
  readUniformSourceValue,
  type CompiledRenderPass,
  type RenderPlanSource
} from '../application/passes';
import type { RenderPassDefinition, UniformValueSource } from '../domain/render-passes';

type UniformSetterMethod = 'setUniform1i' | 'setUniform1f' | 'setUniform2f';

type WebGlUniformBinding = {
  name: string;
  method: UniformSetterMethod;
  source: UniformValueSource;
};

type WebGlUniformBindingWithValue = WebGlUniformBinding & {
  readValue: (uniforms: PipelineUniforms) => number | readonly [number, number];
};

type WebGlPassState = {
  vertexShaderFile: string;
  fragmentShaderFile: string;
  textureUniform: WebGlUniformBindingWithValue;
  additionalUniforms: readonly WebGlUniformBindingWithValue[];
};

type WebGlRenderPass = CompiledRenderPass<WebGlPassState>;

type WebGlProgramState = {
  program: WebGLProgram | null;
  uniformLocations: Map<string, WebGLUniformLocation | null>;
};

type WebGlPrograms = Map<string, WebGlProgramState>;

function isSupportedWebGlUniformSetter(value: string): value is UniformSetterMethod {
  return value === 'setUniform1i' || value === 'setUniform1f' || value === 'setUniform2f';
}

function normalizeWebGlUniformSetter(value: string, context: string): UniformSetterMethod {
  if (isSupportedWebGlUniformSetter(value)) {
    return value;
  }

  throw new Error(`${context} uses unsupported WebGL uniform setter '${value}'`);
}

function readWebGlBindingValue(
  uniforms: PipelineUniforms,
  binding: WebGlUniformBinding
): number | readonly [number, number] {
  const value = readUniformSourceValue(uniforms, binding.source);

  if (binding.method === 'setUniform2f') {
    return readFiniteNumberPair(value, `WebGL uniform '${binding.name}'`);
  }

  return readFiniteNumber(value, `WebGL uniform '${binding.name}'`);
}

function createWebGlBindingWithValue(
  binding: WebGlUniformBinding
): WebGlUniformBindingWithValue {
  return {
    ...binding,
    readValue: (uniforms) => readWebGlBindingValue(uniforms, binding)
  };
}

function normalizeWebGlUniformBinding(
  input: unknown,
  defaultUniformBlock: string,
  passId: string
): WebGlUniformBindingWithValue {
  const context = `Render pass '${passId}' WebGL uniform binding`;
  if (!isRecord(input)) {
    throw new Error(`${context} must be an object`);
  }

  const name = getManifestString(input, 'name', context);
  return createWebGlBindingWithValue({
    name,
    method: normalizeWebGlUniformSetter(getManifestString(input, 'method', context), context),
    source: normalizeUniformValueSource(input.source, defaultUniformBlock, `${context} '${name}'`)
  });
}

function compileWebGlPassState(pass: RenderPassDefinition): WebGlPassState {
  const context = `Render pass '${pass.id}' WebGL uniform bindings`;
  const webglUniforms = pass.webgl2Uniforms as unknown;
  if (!isRecord(webglUniforms)) {
    throw new Error(`${context} are missing`);
  }

  const rawAdditional = webglUniforms.additional;
  if (!Array.isArray(rawAdditional)) {
    throw new Error(`${context} require array 'additional'`);
  }

  return {
    vertexShaderFile: pass.webgl2VertexShader,
    fragmentShaderFile: pass.webgl2FragmentShader,
    textureUniform: normalizeWebGlUniformBinding(
      getManifestRecord(webglUniforms, 'texture', context),
      pass.uniformBlock,
      pass.id
    ),
    additionalUniforms: rawAdditional.map((binding) => normalizeWebGlUniformBinding(
      binding,
      pass.uniformBlock,
      pass.id
    ))
  };
}

const WEBGL_RENDER_PASSES = compileRenderPasses<WebGlPassState>({
  backendName: 'webgl',
  compile: compileWebGlPassState
});

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  label: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`[${label}] Failed to create shader`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`[${label}] Shader compile error: ${error}`);
  }

  return shader;
}

function compileProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  label: string
): WebGlProgramState {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource, label);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource, label);

  const program = gl.createProgram();
  if (!program) {
    throw new Error(`[${label}] Failed to create program`);
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`[${label}] Shader link error: ${error}`);
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  const uniformLocations = new Map<string, WebGLUniformLocation | null>();
  const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < numUniforms; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) {
      uniformLocations.set(info.name, gl.getUniformLocation(program, info.name));
    }
  }

  return { program, uniformLocations };
}

function useProgram(gl: WebGL2RenderingContext, state: WebGlProgramState): void {
  gl.useProgram(state.program);
}

function setProgramUniform(
  gl: WebGL2RenderingContext,
  state: WebGlProgramState,
  binding: WebGlUniformBindingWithValue,
  value: number | readonly [number, number]
): void {
  const loc = state.uniformLocations.get(binding.name) ?? null;
  if (loc === null) {
    return;
  }

  if (binding.method === 'setUniform1i') {
    gl.uniform1i(loc, value as number);
    return;
  }

  if (binding.method === 'setUniform1f') {
    gl.uniform1f(loc, value as number);
    return;
  }

  const [x, y] = value as readonly [number, number];
  gl.uniform2f(loc, x, y);
}

function applyWebGlPassUniforms(
  gl: WebGL2RenderingContext,
  program: WebGlProgramState,
  pass: WebGlRenderPass,
  uniforms: PipelineUniforms
): void {
  const applyBinding = (binding: WebGlUniformBindingWithValue): void => {
    setProgramUniform(gl, program, binding, binding.readValue(uniforms));
  };

  applyBinding(pass.backend.textureUniform);
  for (const binding of pass.backend.additionalUniforms) {
    applyBinding(binding);
  }
}

function destroyProgram(gl: WebGL2RenderingContext, state: WebGlProgramState): void {
  if (state.program) {
    gl.deleteProgram(state.program);
    state.program = null;
  }
  state.uniformLocations.clear();
}

export class WebGlRenderer extends BasePipeline {
  readonly backend = 'webgl2' as const;

  private gl: WebGL2RenderingContext | null = null;
  private programs: WebGlPrograms | null = null;
  private sourceTexture: WebGLTexture | null = null;
  private intermediateTextures: WebGLTexture[] = [];
  private framebuffers: WebGLFramebuffer[] = [];
  private vao: WebGLVertexArrayObject | null = null;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    const baseAttributes: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    };

    this.gl = (this.canvas.getContext('webgl2', baseAttributes) as WebGL2RenderingContext | null)
      ?? (this.canvas.getContext('webgl2', {
        ...baseAttributes,
        powerPreference: 'high-performance'
      }) as WebGL2RenderingContext | null);

    if (!this.gl) {
      throw new RecoverableBackendInitializationError('WebGL2 context not available');
    }

    this.createPrograms();
    this.createVAO();
    this.createResources();

    this._isInitialized = true;
    this._isActive = true;
  }

  private createPrograms(): void {
    const gl = this.gl!;
    const shaders = loadWebGlShaders();

    const programs = new Map<string, WebGlProgramState>();
    for (const pass of WEBGL_RENDER_PASSES) {
      const vertexSource = shaders.byFileName[pass.backend.vertexShaderFile];
      const fragmentSource = shaders.byFileName[pass.backend.fragmentShaderFile];
      if (!vertexSource || !fragmentSource) {
        throw new Error(`Missing WebGL shader source for pass '${pass.passId}'`);
      }

      programs.set(
        pass.passId,
        compileProgram(gl, vertexSource, fragmentSource, `${pass.passId} program`)
      );
    }

    this.programs = programs;
  }

  private createVAO(): void {
    const gl = this.gl!;
    this.vao = gl.createVertexArray();
  }

  private createResources(): void {
    const gl = this.gl!;
    const [targetWidth, targetHeight] = this.uniforms.upscale.outputSize;

    this.sourceTexture = this.createTexture(this.nativeWidth, this.nativeHeight, gl.NEAREST);

    this.intermediateTextures = [];
    this.framebuffers = [];

    for (let i = 0; i < 2; i++) {
      const texture = this.createTexture(targetWidth, targetHeight, gl.LINEAR);
      this.intermediateTextures.push(texture);

      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.framebuffers.push(framebuffer);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  private createTexture(width: number, height: number, filter: number): WebGLTexture {
    const gl = this.gl!;

    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return texture;
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.gl || !this.sourceTexture || !this.programs) return;

    const startTime = performance.now();
    const gl = this.gl;
    const [targetWidth, targetHeight] = this.uniforms.upscale.outputSize;

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindVertexArray(this.vao);
    const plan = createRenderPassPlan(
      getEnabledRenderPasses(WEBGL_RENDER_PASSES, this.uniforms, this.preset),
      this.intermediateTextures.length
    );

    for (const step of plan.steps) {
      const { pass } = step;
      const program = this.programs.get(pass.passId);
      if (!program) {
        throw new Error(`Missing WebGL program for pass '${pass.passId}'`);
      }

      const sourceTexture = this.resolvePlanTexture(step.source);

      if (step.target.kind === 'intermediate') {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[step.target.index]);
        gl.viewport(0, 0, targetWidth, targetHeight);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }

      useProgram(gl, program);
      this.configureTextureSampler(pass, sourceTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      applyWebGlPassUniforms(gl, program, pass, this.uniforms);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (plan.finalCanvasCopy.required) {
      if (plan.finalCanvasCopy.source.kind !== 'intermediate') {
        throw new Error('WebGL render pass chain produced no intermediate output');
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffers[plan.finalCanvasCopy.source.index]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0, 0, targetWidth, targetHeight,
        0, 0, this.canvas.width, this.canvas.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }

    gl.bindVertexArray(null);
    this.updateStats(performance.now() - startTime);
  }

  private resolvePlanTexture(source: RenderPlanSource): WebGLTexture {
    return source.kind === 'source'
      ? this.sourceTexture!
      : this.intermediateTextures[source.index];
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
  }

  clearFrame(): void {
    if (!this.gl) return;

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  protected onUniformsChanged(): void {
    // WebGL uniforms are set per pass during render.
  }

  protected onResize(): void {
    this.releaseRenderTargets();
    this.createResources();
  }

  releaseResources(): void {
    if (!this.gl) {
      this._isActive = false;
      this._isInitialized = false;
      return;
    }

    this.releaseRenderTargets();
    this.programs?.forEach((program) => destroyProgram(this.gl!, program));
    this.programs = null;

    if (this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    this._isActive = false;
    this._isInitialized = false;
  }

  private releaseRenderTargets(): void {
    if (!this.gl) return;

    const gl = this.gl;
    if (this.sourceTexture) {
      gl.deleteTexture(this.sourceTexture);
      this.sourceTexture = null;
    }
    this.intermediateTextures.forEach((texture) => gl.deleteTexture(texture));
    this.intermediateTextures = [];
    this.framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
    this.framebuffers = [];
  }

  async dispose(): Promise<void> {
    this.releaseResources();

    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
  }

  private configureTextureSampler(pass: WebGlRenderPass, texture: WebGLTexture): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = pass.sampler === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
}
