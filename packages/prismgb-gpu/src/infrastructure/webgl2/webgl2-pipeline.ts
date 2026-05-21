import { BasePipeline } from '../base-pipeline';
import {
  applyWebGLPassUniforms,
  getEnabledRenderPasses,
  RENDER_PASS_HELPERS,
  type RenderPassHelpers
} from '../../domain/render-passes/render-passes-helpers';
import { loadShaders } from './webgl2-shader-loader';
import { ShaderProgram } from './shader-program';

type ShaderPrograms = Map<string, ShaderProgram>;

/**
 * WebGL2 4-pass rendering pipeline.
 *
 * Renders Game Boy frames through a configurable shader chain:
 * upscale -> unsharp mask -> color elevation -> CRT/LCD simulation.
 * Uses ping-pong intermediate textures for multi-pass rendering.
 */
export class WebGL2Pipeline extends BasePipeline {
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

    this.gl = this.canvas.getContext('webgl2', baseAttributes)
      ?? this.canvas.getContext('webgl2', {
        ...baseAttributes,
        powerPreference: 'high-performance'
      });

    if (!this.gl) {
      throw new Error('WebGL2 context not available');
    }

    this.createPrograms();
    this.createVAO();
    this.createResources();

    this._isInitialized = true;
    this._isActive = true;
  }

  private createPrograms(): void {
    const gl = this.gl!;
    const shaders = loadShaders();

    const programs = new Map<string, ShaderProgram>();
    for (const pass of RENDER_PASS_HELPERS) {
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
    let currentTexture = this.sourceTexture;
    let outputIndex = 0;
    let currentFramebufferIndex = -1;
    let renderedToCanvas = false;

    for (const pass of getEnabledRenderPasses(this.uniforms, this.preset)) {
      const program = this.programs.get(pass.passId);
      if (!program) {
        throw new Error(`Missing WebGL2 program for pass '${pass.passId}'`);
      }

      const targetTexture = pass.outputsToCanvas
        ? null
        : this.intermediateTextures[outputIndex];

      if (targetTexture) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[outputIndex]);
        gl.viewport(0, 0, targetWidth, targetHeight);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }

      program.use();
      this.configureTextureSampler(pass, currentTexture);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, currentTexture);
      applyWebGLPassUniforms(program, pass, this.uniforms);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      if (pass.outputsToCanvas) {
        renderedToCanvas = true;
        break;
      }

      currentTexture = targetTexture!;
      currentFramebufferIndex = outputIndex;
      outputIndex = (outputIndex + 1) % this.intermediateTextures.length;
    }

    if (!renderedToCanvas) {
      if (currentFramebufferIndex < 0) {
        throw new Error('WebGL2 render pass chain produced no intermediate output');
      }
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffers[currentFramebufferIndex]);
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
    this.releaseResources();
    this.createResources();
  }

  releaseResources(): void {
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
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();

    if (this.programs) {
      this.programs.forEach((program) => program.destroy());
      this.programs = null;
    }

    if (this.gl && this.vao) {
      this.gl.deleteVertexArray(this.vao);
      this.vao = null;
    }

    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.gl = null;
    this._isInitialized = false;
  }

  private configureTextureSampler(pass: RenderPassHelpers, texture: WebGLTexture): void {
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const filter = pass.sampler === 'nearest' ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  }
}
