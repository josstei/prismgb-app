/**
 * Render Worker
 *
 * Web Worker that handles GPU rendering on a separate thread.
 * Supports both WebGPU and WebGL2 backends for maximum compatibility.
 *
 * The worker:
 * - Receives video frames as ImageBitmap (transferred, not copied)
 * - Renders through the 4-pass shader pipeline
 * - Reports frame statistics to the main thread
 */

import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage
} from './worker.protocol.js';

import pixelUpscaleWGSL from '../shaders/webgpu/pixel-upscale.wgsl?raw';
import unsharpMaskWGSL from '../shaders/webgpu/unsharp-mask.wgsl?raw';
import colorElevationWGSL from '../shaders/webgpu/color-elevation.wgsl?raw';
import crtLcdWGSL from '../shaders/webgpu/crt-lcd.wgsl?raw';

import commonVertGLSL from '../shaders/webgl2/common.vert.glsl?raw';
import pixelUpscaleFragGLSL from '../shaders/webgl2/pixel-upscale.frag.glsl?raw';
import unsharpMaskFragGLSL from '../shaders/webgl2/unsharp-mask.frag.glsl?raw';
import colorElevationFragGLSL from '../shaders/webgl2/color-elevation.frag.glsl?raw';
import crtLcdFragGLSL from '../shaders/webgl2/crt-lcd.frag.glsl?raw';

// Import optimization utilities
import {
  BindGroupCache,
  TypedArrayPool,
  UniformTracker,
  CaptureBufferManager,
  ShaderProgram
} from './optimization-utils.js';

// ============================================================================
// Worker State
// ============================================================================

let renderer = null;
let canvas = null;
let isInitialized = false;

// Performance tracking
let frameCount = 0;
let lastStatsTime = performance.now();
let totalFrameTime = 0;

// Lazy capture manager (replaces per-frame double-buffer)
let captureManager = null;

// ============================================================================
// WebGPU Renderer
// ============================================================================

class WebGPURenderer {
  constructor() {
    this.device = null;
    this.context = null;
    this.canvasFormat = null;

    // Shader modules
    this.shaderModules = {};

    // Render pipelines for each pass
    this.pipelines = {};

    // Textures
    this.sourceTexture = null;
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    // Samplers
    this.nearestSampler = null;
    this.linearSampler = null;

    // Uniform buffers
    this.uniformBuffers = {};

    // Configuration
    this.config = null;
    this.currentPreset = null;

    // Error state - stops rendering when device/pipeline is invalid
    this.hasError = false;
    this.errorMessage = null;

    // Performance optimization utilities
    this.bindGroupCache = new BindGroupCache();
    this.typedArrayPool = new TypedArrayPool();
    this.uniformTracker = new UniformTracker();
  }

  async initialize(offscreenCanvas, config) {
    this.config = config;
    canvas = offscreenCanvas;

    // Request GPU adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    // Request device
    this.device = await adapter.requestDevice();

    // Set up device lost handler
    this.device.lost.then((info) => {
      this.hasError = true;
      this.errorMessage = `Device lost: ${info.reason} - ${info.message}`;
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: this.errorMessage,
        code: 'DEVICE_LOST'
      }));
    });

    // Set up uncaptured error handler to catch shader/pipeline compilation errors
    this.device.onuncapturederror = (event) => {
      this.hasError = true;
      this.errorMessage = `GPU error: ${event.error.message}`;
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: this.errorMessage,
        code: 'GPU_ERROR'
      }));
    };

    // Configure canvas context
    this.context = offscreenCanvas.getContext('webgpu');
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });

    // Create shader modules (async to validate compilation)
    await this._createShaderModules();

    // Create samplers
    this._createSamplers();

    // Create resources
    this._createResources(config);

    // Create render pipelines (async to properly catch shader compilation errors)
    await this._createPipelines();
  }

  async _createShaderModules() {
    // Create shader modules and check for compilation errors
    const createAndValidateShader = async (label, code) => {
      const module = this.device.createShaderModule({
        label,
        code
      });

      // Check for compilation errors
      const compilationInfo = await module.getCompilationInfo();
      const errors = compilationInfo.messages.filter(m => m.type === 'error');

      if (errors.length > 0) {
        const errorMsg = errors.map(e => `${e.message} at line ${e.lineNum}`).join('; ');
        throw new Error(`Shader compilation error in ${label}: ${errorMsg}`);
      }

      return module;
    };

    this.shaderModules = {
      pixelUpscale: await createAndValidateShader('Pixel Upscale Shader', pixelUpscaleWGSL),
      unsharpMask: await createAndValidateShader('Unsharp Mask Shader', unsharpMaskWGSL),
      colorElevation: await createAndValidateShader('Color Elevation Shader', colorElevationWGSL),
      crtLcd: await createAndValidateShader('CRT/LCD Shader', crtLcdWGSL)
    };
  }

  _createSamplers() {
    this.nearestSampler = this.device.createSampler({
      label: 'Nearest Sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.linearSampler = this.device.createSampler({
      label: 'Linear Sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  _createResources(config) {
    const { nativeWidth, nativeHeight, targetWidth, targetHeight } = config;

    // Source texture (160×144) - receives video frames
    this.sourceTexture = this.device.createTexture({
      label: 'Source Texture',
      size: [nativeWidth, nativeHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    });

    // Intermediate textures for multi-pass rendering
    // We need 2 intermediate textures for ping-pong rendering
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];
    for (let i = 0; i < 2; i++) {
      const texture = this.device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
        format: 'rgba8unorm',
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.RENDER_ATTACHMENT
      });

      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    // Create uniform buffers (aligned to 16 bytes)
    this.uniformBuffers = {
      upscale: this.device.createBuffer({
        label: 'Upscale Uniforms',
        size: 32, // 2×vec2 + 2×f32 = 24, aligned to 32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      unsharp: this.device.createBuffer({
        label: 'Unsharp Uniforms',
        size: 16, // vec2 + 2×f32 = 16
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      color: this.device.createBuffer({
        label: 'Color Uniforms',
        size: 32, // 5×f32 + padding = 32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      crt: this.device.createBuffer({
        label: 'CRT Uniforms',
        size: 32, // vec2 + 6×f32 = 32
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      })
    };
  }

  async _createPipelines() {
    // Use createRenderPipelineAsync to properly await shader compilation
    // and catch any compilation errors before they become invalid pipelines

    // Pass 1: Pixel Upscale
    this.pipelines.pixelUpscale = await this.device.createRenderPipelineAsync({
      label: 'Pixel Upscale Pipeline',
      layout: 'auto',
      vertex: {
        module: this.shaderModules.pixelUpscale,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: this.shaderModules.pixelUpscale,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: undefined
      }
    });

    // Pass 2: Unsharp Mask
    this.pipelines.unsharpMask = await this.device.createRenderPipelineAsync({
      label: 'Unsharp Mask Pipeline',
      layout: 'auto',
      vertex: {
        module: this.shaderModules.unsharpMask,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: this.shaderModules.unsharpMask,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });

    // Pass 3: Color Elevation
    this.pipelines.colorElevation = await this.device.createRenderPipelineAsync({
      label: 'Color Elevation Pipeline',
      layout: 'auto',
      vertex: {
        module: this.shaderModules.colorElevation,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: this.shaderModules.colorElevation,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });

    // Pass 4: CRT/LCD (outputs to canvas format)
    this.pipelines.crtLcd = await this.device.createRenderPipelineAsync({
      label: 'CRT/LCD Pipeline',
      layout: 'auto',
      vertex: {
        module: this.shaderModules.crtLcd,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: this.shaderModules.crtLcd,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.canvasFormat }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });
  }

  uploadFrame(imageBitmap) {
    // Copy ImageBitmap to source texture
    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture: this.sourceTexture },
      [imageBitmap.width, imageBitmap.height]
    );
  }

  render(uniforms) {
    // Stop rendering if there's a GPU error
    if (this.hasError) {
      return;
    }

    try {
      // Update uniform buffers
      this._updateUniforms(uniforms);

      // Create command encoder
      const commandEncoder = this.device.createCommandEncoder();

      // Track which intermediate texture to use (ping-pong)
      let currentTexture = 0;

      // Pass 1: Pixel Upscale (source → intermediate[0])
      this._renderPass(
        commandEncoder,
        this.pipelines.pixelUpscale,
        this.sourceTexture,
        this.intermediateTextures[0],
        this.uniformBuffers.upscale,
        this.nearestSampler
      );
      currentTexture = 0;

      // Pass 2: Unsharp Mask (if enabled)
      if (uniforms.unsharp.enabled && uniforms.unsharp.strength > 0) {
        const nextTexture = (currentTexture + 1) % 2;
        this._renderPass(
          commandEncoder,
          this.pipelines.unsharpMask,
          this.intermediateTextures[currentTexture],
          this.intermediateTextures[nextTexture],
          this.uniformBuffers.unsharp,
          this.linearSampler
        );
        currentTexture = nextTexture;
      }

      // Pass 3: Color Elevation (if enabled)
      if (uniforms.color.enabled) {
        const nextTexture = (currentTexture + 1) % 2;
        this._renderPass(
          commandEncoder,
          this.pipelines.colorElevation,
          this.intermediateTextures[currentTexture],
          this.intermediateTextures[nextTexture],
          this.uniformBuffers.color,
          this.linearSampler
        );
        currentTexture = nextTexture;
      }

      // Pass 4: CRT/LCD → Canvas (skip shader if all effects disabled)
      const canvasTexture = this.context.getCurrentTexture();
      const crtEffectsEnabled = this._isCrtEnabled(uniforms);

      if (crtEffectsEnabled) {
        this._renderPassToCanvas(
          commandEncoder,
          this.pipelines.crtLcd,
          this.intermediateTextures[currentTexture],
          canvasTexture,
          this.uniformBuffers.crt,
          this.linearSampler
        );
      } else {
        // Bypass CRT shader - direct copy with minimal processing
        this._copyToCanvas(
          commandEncoder,
          this.intermediateTextures[currentTexture],
          canvasTexture
        );
      }

      // Submit commands
      this.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      // GPU error occurred - stop rendering to prevent error spam
      this.hasError = true;
      this.errorMessage = `Render error: ${error.message}`;
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: this.errorMessage,
        code: 'RENDER_ERROR'
      }));
    }
  }

  _getIntermediateTextureView(texture) {
    const index = this.intermediateTextures.indexOf(texture);
    if (index === -1) {
      return texture.createView();
    }

    if (!this.intermediateTextureViews[index]) {
      this.intermediateTextureViews[index] = texture.createView();
    }

    return this.intermediateTextureViews[index];
  }

  _renderPass(commandEncoder, pipeline, inputTexture, outputTexture, uniformBuffer, sampler) {
    // Use cached bind group to avoid per-frame GPU driver calls
    const bindGroup = this.bindGroupCache.getOrCreate(
      this.device,
      pipeline,
      uniformBuffer,
      inputTexture,
      sampler
    );

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this._getIntermediateTextureView(outputTexture),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4); // 4 vertices for triangle strip quad
    passEncoder.end();
  }

  _renderPassToCanvas(commandEncoder, pipeline, inputTexture, canvasTexture, uniformBuffer, sampler) {
    // Note: Canvas texture changes each frame (swapchain), so bind group cannot be cached
    // We still need to create a new bind group each frame for the final pass
    const bindGroup = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputTexture.createView() },
        { binding: 2, resource: sampler }
      ]
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  /**
   * Copy intermediate texture to canvas without CRT effects
   * Uses the CRT pipeline with zeroed uniforms for format conversion
   */
  _copyToCanvas(commandEncoder, inputTexture, canvasTexture) {
    // Use CRT pipeline but with zero-effect uniforms for passthrough
    // This is needed because intermediate textures are rgba8unorm but canvas may be bgra8unorm
    const bindGroup = this.device.createBindGroup({
      layout: this.pipelines.crtLcd.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffers.crt } },
        { binding: 1, resource: inputTexture.createView() },
        { binding: 2, resource: this.linearSampler }
      ]
    });

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: canvasTexture.createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(this.pipelines.crtLcd);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  /**
   * Check if any CRT effects are enabled
   */
  _isCrtEnabled(uniforms) {
    return uniforms.crt.scanlineStrength > 0 ||
      uniforms.crt.pixelMaskStrength > 0 ||
      uniforms.crt.bloomStrength > 0 ||
      uniforms.crt.curvature > 0 ||
      uniforms.crt.vignetteStrength > 0;
  }

  _updateUniforms(uniforms) {
    const { nativeWidth, nativeHeight, targetWidth, targetHeight, scaleFactor } = this.config;

    // Upscale uniforms - use pooled array and track changes
    const upscaleData = this.typedArrayPool.getFloat32WithValues([
      nativeWidth, nativeHeight,  // sourceSize
      targetWidth, targetHeight,  // targetSize
      scaleFactor,                // scaleFactor
      0                           // padding
    ]);

    if (this.uniformTracker.hasChanged('upscale', upscaleData)) {
      this.device.queue.writeBuffer(this.uniformBuffers.upscale, 0, upscaleData);
    }

    // Unsharp uniforms
    const unsharpData = this.typedArrayPool.getFloat32WithValues([
      1.0 / targetWidth, 1.0 / targetHeight,  // texelSize
      uniforms.unsharp.strength,               // strength
      scaleFactor                              // scaleFactor
    ]);

    if (this.uniformTracker.hasChanged('unsharp', unsharpData)) {
      this.device.queue.writeBuffer(this.uniformBuffers.unsharp, 0, unsharpData);
    }

    // Color uniforms
    const colorData = this.typedArrayPool.getFloat32WithValues([
      uniforms.color.gamma,
      uniforms.color.saturation,
      uniforms.color.greenBias,
      uniforms.color.brightness,
      uniforms.color.contrast,
      0, 0, 0  // padding
    ]);

    if (this.uniformTracker.hasChanged('color', colorData)) {
      this.device.queue.writeBuffer(this.uniformBuffers.color, 0, colorData);
    }

    // CRT uniforms
    const crtData = this.typedArrayPool.getFloat32WithValues([
      targetWidth, targetHeight,              // resolution
      scaleFactor,                            // scaleFactor
      uniforms.crt.scanlineStrength,
      uniforms.crt.pixelMaskStrength,
      uniforms.crt.bloomStrength,
      uniforms.crt.curvature,
      uniforms.crt.vignetteStrength
    ]);

    if (this.uniformTracker.hasChanged('crt', crtData)) {
      this.device.queue.writeBuffer(this.uniformBuffers.crt, 0, crtData);
    }
  }

  resize(width, height) {
    this.config.targetWidth = width;
    this.config.targetHeight = height;

    // Recreate intermediate textures at new size
    this.intermediateTextures.forEach(tex => tex.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    for (let i = 0; i < 2; i++) {
      this.intermediateTextures.push(
        this.device.createTexture({
          label: `Intermediate Texture ${i}`,
          size: [width, height],
          format: 'rgba8unorm',
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.RENDER_ATTACHMENT
        })
      );
    }

    // Reconfigure canvas
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });

    // Invalidate caches since textures changed
    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
  }

  destroy() {
    // Destroy textures
    this.sourceTexture?.destroy();
    this.intermediateTextures.forEach(tex => tex?.destroy());
    this.intermediateTextureViews = [];

    // Destroy buffers
    Object.values(this.uniformBuffers).forEach(buf => buf?.destroy());

    // Destroy device
    this.device?.destroy();

    this.device = null;
    this.context = null;
  }
}

// ============================================================================
// WebGL2 Renderer (Fallback)
// ============================================================================

class WebGL2Renderer {
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

    // Configuration
    this.config = null;
  }

  async initialize(offscreenCanvas, config) {
    this.config = config;
    canvas = offscreenCanvas;

    // Get WebGL2 context
    this.gl = offscreenCanvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

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
    const crtEffectsEnabled = this._isCrtEnabled(uniforms);

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

  /**
   * Check if any CRT effects are enabled
   */
  _isCrtEnabled(uniforms) {
    return uniforms.crt.scanlineStrength > 0 ||
      uniforms.crt.pixelMaskStrength > 0 ||
      uniforms.crt.bloomStrength > 0 ||
      uniforms.crt.curvature > 0 ||
      uniforms.crt.vignetteStrength > 0;
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
    Object.values(this.programs).forEach(prog => prog.destroy());

    // Delete VAO
    if (this.vao) gl.deleteVertexArray(this.vao);

    // Lose context
    const loseContext = gl.getExtension('WEBGL_lose_context');
    if (loseContext) loseContext.loseContext();

    this.gl = null;
  }
}

// ============================================================================
// Worker Message Handler
// ============================================================================

self.onmessage = async (event) => {
  const message = event.data;

  if (!isValidWorkerMessage(message)) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Invalid message format',
      code: 'INVALID_MESSAGE'
    }));
    return;
  }

  const { type, payload } = message;

  switch (type) {
    case WorkerMessageType.INIT:
      await handleInit(payload);
      break;

    case WorkerMessageType.FRAME:
      handleFrame(payload);
      break;

    case WorkerMessageType.RESIZE:
      handleResize(payload);
      break;

    case WorkerMessageType.SET_PRESET:
      handleSetPreset(payload);
      break;

    case WorkerMessageType.REQUEST_CAPTURE:
      handleRequestCapture();
      break;

    case WorkerMessageType.CAPTURE:
      handleCapture();
      break;

    case WorkerMessageType.RELEASE:
      handleRelease();
      break;

    case WorkerMessageType.DESTROY:
      handleDestroy();
      break;

    default:
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: `Unknown message type: ${type}`,
        code: 'UNKNOWN_MESSAGE'
      }));
  }
};

async function handleInit(payload) {
  try {
    const { canvas: offscreenCanvas, config } = payload;

    // Support re-initialization after release:
    // - If offscreenCanvas provided (first init), use it and store reference
    // - If no offscreenCanvas but we have stored canvas (re-init), reuse stored canvas
    const canvasToUse = offscreenCanvas || canvas;

    if (!canvasToUse) {
      throw new Error('No canvas available for initialization');
    }

    // Store canvas reference for potential re-init after release
    if (offscreenCanvas) {
      canvas = offscreenCanvas;
    }

    // Set canvas dimensions to match target resolution BEFORE renderer init.
    // The canvas may have been DPR-scaled in the main thread before transfer
    // (e.g., 640×576 CSS → 1280×1152 backing store on 2x Retina). We need to
    // set it to targetWidth×targetHeight so captured frames match the recording
    // canvas dimensions, preventing the "top corner only" recording bug.
    canvasToUse.width = config.targetWidth;
    canvasToUse.height = config.targetHeight;

    // Create appropriate renderer based on API preference
    if (config.api === 'webgpu') {
      renderer = new WebGPURenderer();
    } else {
      renderer = new WebGL2Renderer();
    }

    await renderer.initialize(canvasToUse, config);
    isInitialized = true;

    // Initialize lazy capture manager
    captureManager = new CaptureBufferManager();
    captureManager.initialize(canvasToUse);

    self.postMessage(createWorkerResponse(WorkerResponseType.READY, {
      api: config.api
    }));
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      stack: error.stack,
      code: 'INIT_FAILED'
    }));
  }
}

async function handleFrame(payload) {
  if (!isInitialized || !renderer) return;

  if (renderer.hasError) return;

  const frameStart = performance.now();
  const { imageBitmap, uniforms } = payload;

  try {
    // Upload frame to GPU
    renderer.uploadFrame(imageBitmap);

    // Render through pipeline
    renderer.render(uniforms);

    // Lazy capture: only buffer frame if capture was requested
    // This avoids ~0.5-1ms per-frame overhead when not capturing
    if (captureManager?.hasPendingCapture()) {
      await captureManager.onFrameRendered();
    }

    // Track performance
    const frameTime = performance.now() - frameStart;
    frameCount++;
    totalFrameTime += frameTime;

    // Send stats every second
    const now = performance.now();
    if (now - lastStatsTime >= 1000) {
      const avgFrameTime = totalFrameTime / frameCount;
      self.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
        fps: frameCount,
        frameTime: avgFrameTime.toFixed(2)
      }));

      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = now;
    }

    self.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RENDER_FAILED'
    }));
  } finally {
    // Always close ImageBitmap to release memory, even on error
    // ImageBitmap holds GPU-backed pixel data (~1-2MB per frame)
    imageBitmap?.close();
  }
}

function handleResize(payload) {
  if (!isInitialized || !renderer) return;

  try {
    const { width, height, scaleFactor } = payload;
    renderer.config.scaleFactor = scaleFactor;
    renderer.resize(width, height);

    // Update canvas size
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RESIZE_FAILED'
    }));
  }
}

function handleSetPreset(_payload) {
  // Preset changes are handled via uniforms in handleFrame
  // This handler is for future preset-specific GPU resource changes
}

/**
 * Handle request to capture the next rendered frame
 * Arms the lazy capture buffer so the next frame will be saved
 */
function handleRequestCapture() {
  if (!captureManager) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }

  captureManager.requestCapture();
  self.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED, {}));
}

/**
 * Handle capture request - return captured frame or capture current canvas
 * Uses lazy capture pattern: returns pre-buffered frame if available,
 * otherwise captures current canvas state immediately
 */
async function handleCapture() {
  if (!captureManager) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }

  // Check if we already have a captured frame from lazy capture
  if (captureManager.hasCapturedFrame()) {
    const frameToSend = captureManager.getCapturedFrame();
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      [frameToSend] // Transfer ownership for zero-copy
    );
    return;
  }

  // No pre-captured frame, capture current canvas state immediately
  try {
    const capturedFrame = await createImageBitmap(canvas);
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: capturedFrame
      }),
      [capturedFrame] // Transfer ownership for zero-copy
    );
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Failed to capture frame: ' + error.message,
      code: 'CAPTURE_FAILED'
    }));
  }
}

/**
 * Release GPU resources while keeping worker alive
 * This allows re-initialization without needing a new canvas transfer
 * Used for idle memory savings when streaming stops
 */
function handleRelease() {
  // Clean up the capture manager
  if (captureManager) {
    captureManager.destroy();
    captureManager = null;
  }

  // Destroy renderer (releases GPU device, textures, buffers)
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }

  isInitialized = false;
  // IMPORTANT: Keep canvas reference - we'll reuse it on re-init

  // Reset performance tracking
  frameCount = 0;
  totalFrameTime = 0;
  lastStatsTime = performance.now();

  self.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
  // Note: Do NOT call self.close() - worker stays alive for re-init
}

function handleDestroy() {
  // Clean up the capture manager
  if (captureManager) {
    captureManager.destroy();
    captureManager = null;
  }

  if (renderer) {
    renderer.destroy();
    renderer = null;
  }

  isInitialized = false;
  canvas = null;

  self.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
  self.close();
}
