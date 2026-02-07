import {
  WorkerResponseType,
  createWorkerResponse
} from './worker-protocol.config.js';
import pixelUpscaleWGSL from '../shaders/webgpu/pixel-upscale.wgsl?raw';
import unsharpMaskWGSL from '../shaders/webgpu/unsharp-mask.wgsl?raw';
import colorElevationWGSL from '../shaders/webgpu/color-elevation.wgsl?raw';
import crtLcdWGSL from '../shaders/webgpu/crt-lcd.wgsl?raw';
import {
  BindGroupCache,
  TypedArrayPool,
  UniformTracker
} from './optimization.utils.js';

import type { RenderConfig, RenderUniforms, AdapterInfo } from './engine.types';

function isCrtEnabled(uniforms: RenderUniforms) {
  return uniforms.crt.scanlineStrength > 0
    || uniforms.crt.pixelMaskStrength > 0
    || uniforms.crt.bloomStrength > 0
    || uniforms.crt.curvature > 0
    || uniforms.crt.vignetteStrength > 0;
}

class WebGPURenderer {
  device: GPUDevice | null;
  context: GPUCanvasContext | null;
  canvasFormat: string | null;
  adapterInfo: AdapterInfo | null;
  shaderModules: Record<string, GPUShaderModule>;
  pipelines: Record<string, GPURenderPipeline>;
  _crtLcdBindGroupLayout: GPUBindGroupLayout | null;
  sourceTexture: GPUTexture | null;
  intermediateTextures: GPUTexture[];
  intermediateTextureViews: GPUTextureView[];
  nearestSampler: GPUSampler | null;
  linearSampler: GPUSampler | null;
  uniformBuffers: Record<string, GPUBuffer>;
  config: RenderConfig | null;
  currentPreset: string | null;
  hasError: boolean;
  errorMessage: string | null;
  bindGroupCache: BindGroupCache;
  typedArrayPool: TypedArrayPool;
  uniformTracker: UniformTracker;

  constructor() {
    this.device = null;
    this.context = null;
    this.canvasFormat = null;
    this.adapterInfo = null;

    // Shader modules
    this.shaderModules = {};

    // Render pipelines for each pass
    this.pipelines = {};

    // Cached bind group layout for canvas pass (avoids per-frame getBindGroupLayout call)
    this._crtLcdBindGroupLayout = null;

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

  async initialize(offscreenCanvas: OffscreenCanvas, config: RenderConfig) {
    this.config = config;

    const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
    if (!gpu) {
      throw new Error('WebGPU not available');
    }

    // Request GPU adapter
    const adapter = await gpu.requestAdapter({
      powerPreference: 'low-power'
    }) || await gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.adapterInfo = this._buildAdapterInfo(adapter);

    // Request device
    this.device = await adapter.requestDevice();

    // Set up device lost handler
    this.device.lost.then((info) => {
      this.hasError = true;
      this.errorMessage = `Device lost: ${info.reason} - ${info.message}`;
      this._postError(this.errorMessage, 'DEVICE_LOST');
    });

    // Set up uncaptured error handler to catch shader/pipeline compilation errors
    this.device.onuncapturederror = (event) => {
      this.hasError = true;
      this.errorMessage = `GPU error: ${event.error.message}`;
      this._postError(this.errorMessage, 'GPU_ERROR');
    };

    // Configure canvas context
    this.context = offscreenCanvas.getContext('webgpu');
    this.canvasFormat = gpu.getPreferredCanvasFormat();

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
    const createAndValidateShader = async (label: string, code: string) => {
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

  _createResources(config: RenderConfig) {
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

    // Cache bind group layout for canvas pass (avoids per-frame getBindGroupLayout call)
    this._crtLcdBindGroupLayout = this.pipelines.crtLcd.getBindGroupLayout(0);
  }

  uploadFrame(imageBitmap: ImageBitmap) {
    // Copy ImageBitmap to source texture
    // flipY: true ensures consistent orientation across WebGL2/WebGPU coordinate systems
    this.device.queue.copyExternalImageToTexture(
      { source: imageBitmap, flipY: true },
      { texture: this.sourceTexture },
      [imageBitmap.width, imageBitmap.height]
    );
  }

  render(uniforms: RenderUniforms) {
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
      const crtEffectsEnabled = isCrtEnabled(uniforms);

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
      this.errorMessage = `Render error: ${(error as Error).message}`;
      this._postError(this.errorMessage, 'RENDER_ERROR');
    }
  }

  _postError(message: string, code: string) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message,
      code,
      adapterInfo: this.adapterInfo
    }));
  }

  _buildAdapterInfo(adapter: GPUAdapter): AdapterInfo | null {
    if (!adapter) return null;

    try {
      const info = adapter.info;
      if (!info) return null;

      return {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description
      };
    } catch {
      return null;
    }
  }

  _getIntermediateTextureView(texture: GPUTexture) {
    const index = this.intermediateTextures.indexOf(texture);
    if (index === -1) {
      return texture.createView();
    }

    if (!this.intermediateTextureViews[index]) {
      this.intermediateTextureViews[index] = texture.createView();
    }

    return this.intermediateTextureViews[index];
  }

  _renderPass(commandEncoder: GPUCommandEncoder, pipeline: GPURenderPipeline, inputTexture: GPUTexture, outputTexture: GPUTexture, uniformBuffer: GPUBuffer, sampler: GPUSampler) {
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

  _renderPassToCanvas(commandEncoder: GPUCommandEncoder, pipeline: GPURenderPipeline, inputTexture: GPUTexture, canvasTexture: GPUTexture, uniformBuffer: GPUBuffer, sampler: GPUSampler) {
    // Note: Canvas texture changes each frame (swapchain), so bind group cannot be cached
    // We still need to create a new bind group each frame for the final pass
    // But we use the cached layout and intermediate texture view to minimize per-frame allocations
    const bindGroup = this.device.createBindGroup({
      layout: this._crtLcdBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this._getIntermediateTextureView(inputTexture) },
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
  _copyToCanvas(commandEncoder: GPUCommandEncoder, inputTexture: GPUTexture, canvasTexture: GPUTexture) {
    // Use CRT pipeline but with zero-effect uniforms for passthrough
    // This is needed because intermediate textures are rgba8unorm but canvas may be bgra8unorm
    // Use cached layout and intermediate texture view to minimize per-frame allocations
    const bindGroup = this.device.createBindGroup({
      layout: this._crtLcdBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffers.crt } },
        { binding: 1, resource: this._getIntermediateTextureView(inputTexture) },
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

  _updateUniforms(uniforms: RenderUniforms) {
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

  resize(width: number, height: number) {
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
    Object.values(this.uniformBuffers).forEach((buf) => buf?.destroy?.());

    // Destroy device
    this.device?.destroy();

    this.device = null;
    this.context = null;
  }
}


export {
  WebGPURenderer
};
