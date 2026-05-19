import { BasePipeline } from '../base-pipeline';
import { loadShaders } from './webgl2-shader-loader';
import { ShaderProgram } from './shader-program';

interface ShaderPrograms {
  pixelUpscale: ShaderProgram;
  unsharpMask: ShaderProgram;
  colorElevation: ShaderProgram;
  crtLcd: ShaderProgram;
}

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

    this.programs = {
      pixelUpscale: new ShaderProgram(gl, shaders.vertex, shaders.pixelUpscale, 'PixelUpscale'),
      unsharpMask: new ShaderProgram(gl, shaders.vertex, shaders.unsharpMask, 'UnsharpMask'),
      colorElevation: new ShaderProgram(gl, shaders.vertex, shaders.colorElevation, 'ColorElevation'),
      crtLcd: new ShaderProgram(gl, shaders.vertex, shaders.crtLcd, 'CrtLcd')
    };
  }

  private createVAO(): void {
    const gl = this.gl!;
    this.vao = gl.createVertexArray();
  }

  private createResources(): void {
    const gl = this.gl!;
    const { upscale } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

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
    const { upscale, unsharp, color, crt } = this.uniforms;
    const [targetWidth, targetHeight] = upscale.outputSize;

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.bindTexture(gl.TEXTURE_2D, null);

    gl.bindVertexArray(this.vao);

    let currentTexture = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
    gl.viewport(0, 0, targetWidth, targetHeight);
    this.programs.pixelUpscale.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    this.programs.pixelUpscale.setUniform1i('uSourceTex', 0);
    this.programs.pixelUpscale.setUniform2f('uSourceSize', this.nativeWidth, this.nativeHeight);
    this.programs.pixelUpscale.setUniform2f('uTargetSize', targetWidth, targetHeight);
    this.programs.pixelUpscale.setUniform1f('uScaleFactor', upscale.scaleFactor);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    currentTexture = 0;

    if (this.preset.unsharp.enabled && unsharp.strength > 0) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.unsharpMask.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.unsharpMask.setUniform1i('uInputTex', 0);
      this.programs.unsharpMask.setUniform2f('uTexelSize', unsharp.texelSize[0], unsharp.texelSize[1]);
      this.programs.unsharpMask.setUniform1f('uStrength', unsharp.strength);
      this.programs.unsharpMask.setUniform1f('uScaleFactor', unsharp.scaleFactor);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    if (this.preset.color.enabled) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.colorElevation.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.colorElevation.setUniform1i('uInputTex', 0);
      this.programs.colorElevation.setUniform1f('uGamma', color.gamma);
      this.programs.colorElevation.setUniform1f('uSaturation', color.saturation);
      this.programs.colorElevation.setUniform1f('uGreenBias', color.greenBias);
      this.programs.colorElevation.setUniform1f('uBrightness', color.brightness);
      this.programs.colorElevation.setUniform1f('uContrast', color.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    const crtEnabled = crt.scanlineStrength > 0 || crt.pixelMaskStrength > 0 ||
      crt.bloomStrength > 0 || crt.curvature > 0 || crt.vignetteStrength > 0;

    if (crtEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.programs.crtLcd.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.crtLcd.setUniform1i('uInputTex', 0);
      this.programs.crtLcd.setUniform2f('uResolution', crt.resolution[0], crt.resolution[1]);
      this.programs.crtLcd.setUniform1f('uScaleFactor', crt.scaleFactor);
      this.programs.crtLcd.setUniform1f('uScanlineStrength', crt.scanlineStrength);
      this.programs.crtLcd.setUniform1f('uPixelMaskStrength', crt.pixelMaskStrength);
      this.programs.crtLcd.setUniform1f('uBloomStrength', crt.bloomStrength);
      this.programs.crtLcd.setUniform1f('uCurvature', crt.curvature);
      this.programs.crtLcd.setUniform1f('uVignetteStrength', crt.vignetteStrength);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffers[currentTexture]);
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

  protected onUniformsChanged(): void {
    // WebGL2 uniforms are set per-frame in renderFrame() via setUniform calls.
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
    this.intermediateTextures.forEach(t => gl.deleteTexture(t));
    this.intermediateTextures = [];
    this.framebuffers.forEach(f => gl.deleteFramebuffer(f));
    this.framebuffers = [];
    this._isActive = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();

    if (this.programs) {
      this.programs.pixelUpscale.destroy();
      this.programs.unsharpMask.destroy();
      this.programs.colorElevation.destroy();
      this.programs.crtLcd.destroy();
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
}
