import commonVertGLSL from '../shaders/webgl2/common.vert.glsl?raw';
import pixelUpscaleFragGLSL from '../shaders/webgl2/pixel-upscale.frag.glsl?raw';
import unsharpMaskFragGLSL from '../shaders/webgl2/unsharp-mask.frag.glsl?raw';
import colorElevationFragGLSL from '../shaders/webgl2/color-elevation.frag.glsl?raw';
import crtLcdFragGLSL from '../shaders/webgl2/crt-lcd.frag.glsl?raw';
import { ShaderProgram } from './optimization.utils.js';

function isCrtEnabled(uniforms) {
  return uniforms.crt.scanlineStrength > 0
    || uniforms.crt.pixelMaskStrength > 0
    || uniforms.crt.bloomStrength > 0
    || uniforms.crt.curvature > 0
    || uniforms.crt.vignetteStrength > 0;
}

class WebGL2Renderer {
  gl: WebGL2RenderingContext | null;
  programs: Record<string, ShaderProgram>;
  sourceTexture: WebGLTexture | null;
  intermediateTextures: WebGLTexture[];
  framebuffers: WebGLFramebuffer[];
  vao: WebGLVertexArrayObject | null;
  canvas: OffscreenCanvas | null;
  config: any;

  constructor() {
    this.gl = null;

    // Shader programs
    this.programs = {};

    // Textures
    this.sourceTexture = null;
    this.intermediateTextures = [];
    this.framebuffers = [];

    // VAO for full-screen triangle
    this.vao = null;
    this.canvas = null;

    // Configuration
    this.config = null;
  }

  async initialize(offscreenCanvas, config) {
    this.config = config;
    this.canvas = offscreenCanvas;

    // Get WebGL2 context
    const baseAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    };

    this.gl = offscreenCanvas.getContext('webgl2', baseAttributes) ||
      offscreenCanvas.getContext('webgl2', { ...baseAttributes, powerPreference: 'high-performance' });

    if (!this.gl) {
      throw new Error('WebGL2 context not available');
    }

    const gl = this.gl;

    // Create shader programs
    this._createPrograms();

    // Create VAO for full-screen triangle
    this.vao = gl.createVertexArray();

    // Create textures and framebuffers
    this._createResources(config);
  }

  _createPrograms() {
    // Use ShaderProgram class for cached uniform locations
    this.programs = {
      pixelUpscale: new ShaderProgram(this.gl, commonVertGLSL, pixelUpscaleFragGLSL, 'PixelUpscale'),
      unsharpMask: new ShaderProgram(this.gl, commonVertGLSL, unsharpMaskFragGLSL, 'UnsharpMask'),
      colorElevation: new ShaderProgram(this.gl, commonVertGLSL, colorElevationFragGLSL, 'ColorElevation'),
      crtLcd: new ShaderProgram(this.gl, commonVertGLSL, crtLcdFragGLSL, 'CrtLcd')
    };
  }

  _createResources(config) {
    const gl = this.gl;
    const { nativeWidth, nativeHeight, targetWidth, targetHeight } = config;

    // Source texture (160×144)
    this.sourceTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, nativeWidth, nativeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    // Intermediate textures for ping-pong rendering
    for (let i = 0; i < 2; i++) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, targetWidth, targetHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.intermediateTextures.push(texture);

      // Create framebuffer for this texture
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.framebuffers.push(framebuffer);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  uploadFrame(imageBitmap) {
    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(uniforms) {
    const gl = this.gl;
    const { nativeWidth, nativeHeight, targetWidth, targetHeight, scaleFactor } = this.config;
    const canvas = this.canvas;
    if (!canvas) {
      return;
    }

    gl.bindVertexArray(this.vao);

    let currentTexture = 0;

    // Pass 1: Pixel Upscale - use cached uniform locations
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[0]);
    gl.viewport(0, 0, targetWidth, targetHeight);
    this.programs.pixelUpscale.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture);
    this.programs.pixelUpscale.setUniform1i('uSourceTex', 0);
    this.programs.pixelUpscale.setUniform2f('uSourceSize', nativeWidth, nativeHeight);
    this.programs.pixelUpscale.setUniform2f('uTargetSize', targetWidth, targetHeight);
    this.programs.pixelUpscale.setUniform1f('uScaleFactor', scaleFactor);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    currentTexture = 0;

    // Pass 2: Unsharp Mask (if enabled)
    if (uniforms.unsharp.enabled && uniforms.unsharp.strength > 0) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.unsharpMask.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.unsharpMask.setUniform1i('uInputTex', 0);
      this.programs.unsharpMask.setUniform2f('uTexelSize', 1.0 / targetWidth, 1.0 / targetHeight);
      this.programs.unsharpMask.setUniform1f('uStrength', uniforms.unsharp.strength);
      this.programs.unsharpMask.setUniform1f('uScaleFactor', scaleFactor);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    // Pass 3: Color Elevation (if enabled)
    if (uniforms.color.enabled) {
      const nextTexture = (currentTexture + 1) % 2;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[nextTexture]);
      this.programs.colorElevation.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.colorElevation.setUniform1i('uInputTex', 0);
      this.programs.colorElevation.setUniform1f('uGamma', uniforms.color.gamma);
      this.programs.colorElevation.setUniform1f('uSaturation', uniforms.color.saturation);
      this.programs.colorElevation.setUniform1f('uGreenBias', uniforms.color.greenBias);
      this.programs.colorElevation.setUniform1f('uBrightness', uniforms.color.brightness);
      this.programs.colorElevation.setUniform1f('uContrast', uniforms.color.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTexture = nextTexture;
    }

    // Pass 4: CRT/LCD → Canvas (skip shader if all effects disabled)
    const crtEffectsEnabled = isCrtEnabled(uniforms);

    if (crtEffectsEnabled) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      this.programs.crtLcd.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[currentTexture]);
      this.programs.crtLcd.setUniform1i('uInputTex', 0);
      this.programs.crtLcd.setUniform2f('uResolution', targetWidth, targetHeight);
      this.programs.crtLcd.setUniform1f('uScaleFactor', scaleFactor);
      this.programs.crtLcd.setUniform1f('uScanlineStrength', uniforms.crt.scanlineStrength);
      this.programs.crtLcd.setUniform1f('uPixelMaskStrength', uniforms.crt.pixelMaskStrength);
      this.programs.crtLcd.setUniform1f('uBloomStrength', uniforms.crt.bloomStrength);
      this.programs.crtLcd.setUniform1f('uCurvature', uniforms.crt.curvature);
      this.programs.crtLcd.setUniform1f('uVignetteStrength', uniforms.crt.vignetteStrength);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      // Bypass CRT shader - use blitFramebuffer for direct copy
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.framebuffers[currentTexture]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0, 0, targetWidth, targetHeight,  // source rect
        0, 0, canvas.width, canvas.height, // dest rect
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST  // filter - nearest for pixel-perfect
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }

    gl.bindVertexArray(null);
  }

  resize(width, height) {
    const gl = this.gl;
    this.config.targetWidth = width;
    this.config.targetHeight = height;

    // Resize intermediate textures
    for (let i = 0; i < 2; i++) {
      gl.bindTexture(gl.TEXTURE_2D, this.intermediateTextures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroy() {
    const gl = this.gl;

    // Delete textures
    if (this.sourceTexture) gl.deleteTexture(this.sourceTexture);
    this.intermediateTextures.forEach(tex => gl.deleteTexture(tex));

    // Delete framebuffers
    this.framebuffers.forEach(fb => gl.deleteFramebuffer(fb));

    // Delete shader programs (using ShaderProgram.destroy())
    (Object.values(this.programs) as any[]).forEach((prog) => prog?.destroy?.());

    // Delete VAO
    if (this.vao) gl.deleteVertexArray(this.vao);

    // Lose context
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();

    this.gl = null;
    this.canvas = null;
  }
}


export {
  WebGL2Renderer
};
