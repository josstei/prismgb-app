import commonVertGLSL from '../shaders/webgl2/common.vert.glsl?raw';
import pixelUpscaleFragGLSL from '../shaders/webgl2/pixel-upscale.frag.glsl?raw';
import unsharpMaskFragGLSL from '../shaders/webgl2/unsharp-mask.frag.glsl?raw';
import colorElevationFragGLSL from '../shaders/webgl2/color-elevation.frag.glsl?raw';
import crtLcdFragGLSL from '../shaders/webgl2/crt-lcd.frag.glsl?raw';
import { ShaderProgram } from './optimization.utils.js';

import type { RenderConfig, RenderUniforms } from './engine.types';

type WebGL2Programs = {
  pixelUpscale: ShaderProgram;
  unsharpMask: ShaderProgram;
  colorElevation: ShaderProgram;
  crtLcd: ShaderProgram;
};

type WebGL2Resources = {
  sourceTexture: WebGLTexture;
  intermediateTextures: [WebGLTexture, WebGLTexture];
  framebuffers: [WebGLFramebuffer, WebGLFramebuffer];
  vao: WebGLVertexArrayObject;
};

type WebGL2State = {
  gl: WebGL2RenderingContext;
  canvas: OffscreenCanvas;
  config: RenderConfig;
  programs: WebGL2Programs;
  resources: WebGL2Resources;
};

function isCrtEnabled(uniforms: RenderUniforms): boolean {
  return uniforms.crt.scanlineStrength > 0
    || uniforms.crt.pixelMaskStrength > 0
    || uniforms.crt.bloomStrength > 0
    || uniforms.crt.curvature > 0
    || uniforms.crt.vignetteStrength > 0;
}

class WebGL2Renderer {
  private _state: WebGL2State | null = null;

  get config(): RenderConfig | null {
    return this._state?.config ?? null;
  }

  private _requireState(): WebGL2State {
    if (!this._state) {
      throw new Error('WebGL2 renderer not initialized');
    }
    return this._state;
  }

  async initialize(offscreenCanvas: OffscreenCanvas, config: RenderConfig): Promise<void> {
    const baseAttributes: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    };

    const gl = offscreenCanvas.getContext('webgl2', baseAttributes) ||
      offscreenCanvas.getContext('webgl2', { ...baseAttributes, powerPreference: 'high-performance' });

    if (!gl) {
      throw new Error('WebGL2 context not available');
    }

    const programs = this._createPrograms(gl);
    const resources = this._createResources(gl, config);

    this._state = {
      gl,
      canvas: offscreenCanvas,
      config,
      programs,
      resources
    };
  }

  private _createPrograms(gl: WebGL2RenderingContext): WebGL2Programs {
    return {
      pixelUpscale: new ShaderProgram(gl, commonVertGLSL, pixelUpscaleFragGLSL, 'PixelUpscale'),
      unsharpMask: new ShaderProgram(gl, commonVertGLSL, unsharpMaskFragGLSL, 'UnsharpMask'),
      colorElevation: new ShaderProgram(gl, commonVertGLSL, colorElevationFragGLSL, 'ColorElevation'),
      crtLcd: new ShaderProgram(gl, commonVertGLSL, crtLcdFragGLSL, 'CrtLcd')
    };
  }

  private _createTexture(
    gl: WebGL2RenderingContext,
    width: number,
    height: number,
    minFilter: number,
    magFilter: number
  ): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create WebGL2 texture');
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    return texture;
  }

  private _createFramebuffer(
    gl: WebGL2RenderingContext,
    texture: WebGLTexture
  ): WebGLFramebuffer {
    const framebuffer = gl.createFramebuffer();
    if (!framebuffer) {
      throw new Error('Failed to create WebGL2 framebuffer');
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return framebuffer;
  }

  private _createResources(gl: WebGL2RenderingContext, config: RenderConfig): WebGL2Resources {
    const { nativeWidth, nativeHeight, targetWidth, targetHeight } = config;

    const vao = gl.createVertexArray();
    if (!vao) {
      throw new Error('Failed to create WebGL2 vertex array');
    }

    const sourceTexture = this._createTexture(gl, nativeWidth, nativeHeight, gl.NEAREST, gl.NEAREST);
    const intermediateTextures: [WebGLTexture, WebGLTexture] = [
      this._createTexture(gl, targetWidth, targetHeight, gl.LINEAR, gl.LINEAR),
      this._createTexture(gl, targetWidth, targetHeight, gl.LINEAR, gl.LINEAR)
    ];
    const framebuffers: [WebGLFramebuffer, WebGLFramebuffer] = [
      this._createFramebuffer(gl, intermediateTextures[0]),
      this._createFramebuffer(gl, intermediateTextures[1])
    ];

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);

    return {
      sourceTexture,
      intermediateTextures,
      framebuffers,
      vao
    };
  }

  uploadFrame(imageBitmap: ImageBitmap): void {
    const { gl, resources } = this._requireState();

    gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageBitmap);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  render(uniforms: RenderUniforms): void {
    const { gl, canvas, config, programs, resources } = this._requireState();
    const { nativeWidth, nativeHeight, targetWidth, targetHeight, scaleFactor } = config;

    gl.bindVertexArray(resources.vao);

    let currentTextureIndex: 0 | 1 = 0;

    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffers[0]);
    gl.viewport(0, 0, targetWidth, targetHeight);
    programs.pixelUpscale.use();

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.sourceTexture);
    programs.pixelUpscale.setUniform1i('uSourceTex', 0);
    programs.pixelUpscale.setUniform2f('uSourceSize', nativeWidth, nativeHeight);
    programs.pixelUpscale.setUniform2f('uTargetSize', targetWidth, targetHeight);
    programs.pixelUpscale.setUniform1f('uScaleFactor', scaleFactor);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (uniforms.unsharp.enabled && uniforms.unsharp.strength > 0) {
      const nextTextureIndex: 0 | 1 = currentTextureIndex === 0 ? 1 : 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffers[nextTextureIndex]);
      programs.unsharpMask.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.intermediateTextures[currentTextureIndex]);
      programs.unsharpMask.setUniform1i('uInputTex', 0);
      programs.unsharpMask.setUniform2f('uTexelSize', 1.0 / targetWidth, 1.0 / targetHeight);
      programs.unsharpMask.setUniform1f('uStrength', uniforms.unsharp.strength);
      programs.unsharpMask.setUniform1f('uScaleFactor', scaleFactor);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTextureIndex = nextTextureIndex;
    }

    if (uniforms.color.enabled) {
      const nextTextureIndex: 0 | 1 = currentTextureIndex === 0 ? 1 : 0;
      gl.bindFramebuffer(gl.FRAMEBUFFER, resources.framebuffers[nextTextureIndex]);
      programs.colorElevation.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.intermediateTextures[currentTextureIndex]);
      programs.colorElevation.setUniform1i('uInputTex', 0);
      programs.colorElevation.setUniform1f('uGamma', uniforms.color.gamma);
      programs.colorElevation.setUniform1f('uSaturation', uniforms.color.saturation);
      programs.colorElevation.setUniform1f('uGreenBias', uniforms.color.greenBias);
      programs.colorElevation.setUniform1f('uBrightness', uniforms.color.brightness);
      programs.colorElevation.setUniform1f('uContrast', uniforms.color.contrast);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
      currentTextureIndex = nextTextureIndex;
    }

    if (isCrtEnabled(uniforms)) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      programs.crtLcd.use();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, resources.intermediateTextures[currentTextureIndex]);
      programs.crtLcd.setUniform1i('uInputTex', 0);
      programs.crtLcd.setUniform2f('uResolution', targetWidth, targetHeight);
      programs.crtLcd.setUniform1f('uScaleFactor', scaleFactor);
      programs.crtLcd.setUniform1f('uScanlineStrength', uniforms.crt.scanlineStrength);
      programs.crtLcd.setUniform1f('uPixelMaskStrength', uniforms.crt.pixelMaskStrength);
      programs.crtLcd.setUniform1f('uBloomStrength', uniforms.crt.bloomStrength);
      programs.crtLcd.setUniform1f('uCurvature', uniforms.crt.curvature);
      programs.crtLcd.setUniform1f('uVignetteStrength', uniforms.crt.vignetteStrength);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, resources.framebuffers[currentTextureIndex]);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0,
        0,
        targetWidth,
        targetHeight,
        0,
        0,
        canvas.width,
        canvas.height,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }

    gl.bindVertexArray(null);
  }

  resize(width: number, height: number): void {
    const { gl, config, resources } = this._requireState();
    config.targetWidth = width;
    config.targetHeight = height;

    for (const texture of resources.intermediateTextures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }

    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  destroy(): void {
    const state = this._state;
    if (!state) {
      return;
    }

    const { gl, programs, resources } = state;

    gl.deleteTexture(resources.sourceTexture);
    for (const texture of resources.intermediateTextures) {
      gl.deleteTexture(texture);
    }

    for (const framebuffer of resources.framebuffers) {
      gl.deleteFramebuffer(framebuffer);
    }

    for (const program of Object.values(programs)) {
      program.destroy();
    }

    gl.deleteVertexArray(resources.vao);

    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) {
      loseContext.loseContext();
    }

    this._state = null;
  }
}

export {
  WebGL2Renderer
};
