import { BasePipeline } from '../pipeline-base';
import { RecoverableBackendInitializationError } from '../../domain/errors';
import { getEnabledRenderPasses } from '../../application/render-pass-enablement';
import { createRenderPassPlan, type RenderPlanSource } from '../../application/render-plan';
import {
  applyWebGLPassUniforms,
  WEBGL2_RENDER_PASSES,
  type WebGL2RenderPass
} from '../webgl2.uniforms';
import { loadWebGL2Shaders } from '../shader-sources';
import { ShaderProgram } from './webgl2.program';

type ShaderPrograms = Map<string, ShaderProgram>;

/**
 * WebGL2 manifest-driven rendering pipeline.
 *
 * Renders Game Boy frames through the render-pass contract and uses ping-pong
 * intermediate textures for multi-pass rendering.
 */
export class WebGL2Pipeline extends BasePipeline {
  readonly backend = 'webgl2' as const;

  private gl: WebGL2RenderingContext | null = null;
  private programs: ShaderPrograms | null = null;
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
    const shaders = loadWebGL2Shaders();

    const programs = new Map<string, ShaderProgram>();
    for (const pass of WEBGL2_RENDER_PASSES) {
      const vertexSource = shaders.byFileName[pass.webgl.vertexShaderFile];
      const fragmentSource = shaders.byFileName[pass.webgl.fragmentShaderFile];
      if (!vertexSource || !fragmentSource) {
        throw new Error(`Missing WebGL2 shader source for pass '${pass.passId}'`);
      }

      const label = `${pass.passId} program`;
      programs.set(pass.passId, new ShaderProgram(gl, vertexSource, fragmentSource, label));
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
      getEnabledRenderPasses(WEBGL2_RENDER_PASSES, this.uniforms, this.preset),
      this.intermediateTextures.length
    );

    for (const step of plan.steps) {
      const { pass } = step;
      const program = this.programs.get(pass.passId);
      if (!program) {
        throw new Error(`Missing WebGL2 program for pass '${pass.passId}'`);
      }

      const sourceTexture = this.resolvePlanTexture(step.source);

      if (step.target.kind === 'intermediate') {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[step.target.index]);
        gl.viewport(0, 0, targetWidth, targetHeight);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }

      program.use();
      this.configureTextureSampler(pass, sourceTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      applyWebGLPassUniforms(program, pass, this.uniforms);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    if (plan.finalCanvasCopy.required) {
      if (plan.finalCanvasCopy.source.kind !== 'intermediate') {
        throw new Error('WebGL2 render pass chain produced no intermediate output');
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
    // WebGL2 uniforms are set per-pass per-frame.
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
    this.programs?.forEach((program) => program.destroy());
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

  private configureTextureSampler(pass: WebGL2RenderPass, texture: WebGLTexture): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = pass.sampler === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
}
