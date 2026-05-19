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
import { getErrorMessage } from '@shared/lib/errors/error-guards.js';

import type { RenderConfig, RenderUniforms, AdapterInfo } from './engine.types';

type WebGPUShaderModules = {
  pixelUpscale: GPUShaderModule;
  unsharpMask: GPUShaderModule;
  colorElevation: GPUShaderModule;
  crtLcd: GPUShaderModule;
};

type WebGPURenderPipelines = {
  pixelUpscale: GPURenderPipeline;
  unsharpMask: GPURenderPipeline;
  colorElevation: GPURenderPipeline;
  crtLcd: GPURenderPipeline;
};

type WebGPUUniformBuffers = {
  upscale: GPUBuffer;
  unsharp: GPUBuffer;
  color: GPUBuffer;
  crt: GPUBuffer;
};

type WebGPUSamplers = {
  nearest: GPUSampler;
  linear: GPUSampler;
};

type WebGPUTextures = {
  sourceTexture: GPUTexture;
  intermediateTextures: [GPUTexture, GPUTexture];
  intermediateTextureViews: [GPUTextureView, GPUTextureView];
};

type WebGPUState = {
  device: GPUDevice;
  context: GPUCanvasContext;
  canvasFormat: GPUTextureFormat;
  config: RenderConfig;
  shaderModules: WebGPUShaderModules;
  pipelines: WebGPURenderPipelines;
  crtLcdBindGroupLayout: GPUBindGroupLayout;
  textures: WebGPUTextures;
  samplers: WebGPUSamplers;
  uniformBuffers: WebGPUUniformBuffers;
};

type NavigatorWithGpu = Navigator & {
  gpu?: GPU;
};

function isCrtEnabled(uniforms: RenderUniforms): boolean {
  return uniforms.crt.scanlineStrength > 0
    || uniforms.crt.pixelMaskStrength > 0
    || uniforms.crt.bloomStrength > 0
    || uniforms.crt.curvature > 0
    || uniforms.crt.vignetteStrength > 0;
}

class WebGPURenderer {
  adapterInfo: AdapterInfo | null = null;
  hasError = false;
  errorMessage: string | null = null;

  private _state: WebGPUState | null = null;
  private readonly bindGroupCache = new BindGroupCache();
  private readonly typedArrayPool = new TypedArrayPool();
  private readonly uniformTracker = new UniformTracker();

  get config(): RenderConfig | null {
    return this._state?.config ?? null;
  }

  private _requireState(): WebGPUState {
    if (!this._state) {
      throw new Error('WebGPU renderer not initialized');
    }
    return this._state;
  }

  async initialize(offscreenCanvas: OffscreenCanvas, config: RenderConfig): Promise<void> {
    const gpu = (navigator as NavigatorWithGpu).gpu;
    if (!gpu) {
      throw new Error('WebGPU not available');
    }

    const adapter = await gpu.requestAdapter({ powerPreference: 'low-power' }) ||
      await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.adapterInfo = this._buildAdapterInfo(adapter);

    const device = await adapter.requestDevice();
    this._registerDeviceErrorHandlers(device);

    const context = offscreenCanvas.getContext('webgpu');
    if (!context) {
      device.destroy();
      throw new Error('WebGPU canvas context not available');
    }

    const canvasFormat = gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque'
    });

    const shaderModules = await this._createShaderModules(device);
    const samplers = this._createSamplers(device);
    const textures = this._createTextures(device, config);
    const uniformBuffers = this._createUniformBuffers(device);
    const { pipelines, crtLcdBindGroupLayout } = await this._createPipelines(
      device,
      shaderModules,
      canvasFormat
    );

    this._state = {
      device,
      context,
      canvasFormat,
      config,
      shaderModules,
      pipelines,
      crtLcdBindGroupLayout,
      textures,
      samplers,
      uniformBuffers
    };
  }

  private _registerDeviceErrorHandlers(device: GPUDevice): void {
    device.lost.then((info) => {
      this.hasError = true;
      this.errorMessage = `Device lost: ${info.reason} - ${info.message}`;
      this._postError(this.errorMessage, 'DEVICE_LOST');
    });

    device.onuncapturederror = (event) => {
      this.hasError = true;
      this.errorMessage = `GPU error: ${event.error.message}`;
      this._postError(this.errorMessage, 'GPU_ERROR');
    };
  }

  private async _createShaderModules(device: GPUDevice): Promise<WebGPUShaderModules> {
    const createAndValidateShader = async (label: string, code: string): Promise<GPUShaderModule> => {
      const module = device.createShaderModule({ label, code });
      const compilationInfo = await module.getCompilationInfo();
      const errors = compilationInfo.messages.filter((message) => message.type === 'error');

      if (errors.length > 0) {
        const errorMessage = errors
          .map((message) => `${message.message} at line ${message.lineNum}`)
          .join('; ');
        throw new Error(`Shader compilation error in ${label}: ${errorMessage}`);
      }

      return module;
    };

    return {
      pixelUpscale: await createAndValidateShader('Pixel Upscale Shader', pixelUpscaleWGSL),
      unsharpMask: await createAndValidateShader('Unsharp Mask Shader', unsharpMaskWGSL),
      colorElevation: await createAndValidateShader('Color Elevation Shader', colorElevationWGSL),
      crtLcd: await createAndValidateShader('CRT/LCD Shader', crtLcdWGSL)
    };
  }

  private _createSamplers(device: GPUDevice): WebGPUSamplers {
    return {
      nearest: device.createSampler({
        label: 'Nearest Sampler',
        magFilter: 'nearest',
        minFilter: 'nearest',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      }),
      linear: device.createSampler({
        label: 'Linear Sampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge'
      })
    };
  }

  private _createIntermediateTextures(
    device: GPUDevice,
    width: number,
    height: number
  ): [GPUTexture, GPUTexture] {
    return [
      device.createTexture({
        label: 'Intermediate Texture 0',
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      }),
      device.createTexture({
        label: 'Intermediate Texture 1',
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      })
    ];
  }

  private _createTextures(device: GPUDevice, config: RenderConfig): WebGPUTextures {
    const { nativeWidth, nativeHeight, targetWidth, targetHeight } = config;
    const sourceTexture = device.createTexture({
      label: 'Source Texture',
      size: [nativeWidth, nativeHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT
    });

    const intermediateTextures = this._createIntermediateTextures(device, targetWidth, targetHeight);
    return {
      sourceTexture,
      intermediateTextures,
      intermediateTextureViews: [
        intermediateTextures[0].createView(),
        intermediateTextures[1].createView()
      ]
    };
  }

  private _createUniformBuffers(device: GPUDevice): WebGPUUniformBuffers {
    return {
      upscale: device.createBuffer({
        label: 'Upscale Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      unsharp: device.createBuffer({
        label: 'Unsharp Uniforms',
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      color: device.createBuffer({
        label: 'Color Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }),
      crt: device.createBuffer({
        label: 'CRT Uniforms',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      })
    };
  }

  private async _createPipelines(
    device: GPUDevice,
    shaderModules: WebGPUShaderModules,
    canvasFormat: GPUTextureFormat
  ): Promise<{
    pipelines: WebGPURenderPipelines;
    crtLcdBindGroupLayout: GPUBindGroupLayout;
  }> {
    const pixelUpscale = await device.createRenderPipelineAsync({
      label: 'Pixel Upscale Pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModules.pixelUpscale,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModules.pixelUpscale,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip',
        stripIndexFormat: undefined
      }
    });

    const unsharpMask = await device.createRenderPipelineAsync({
      label: 'Unsharp Mask Pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModules.unsharpMask,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModules.unsharpMask,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });

    const colorElevation = await device.createRenderPipelineAsync({
      label: 'Color Elevation Pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModules.colorElevation,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModules.colorElevation,
        entryPoint: 'fragmentMain',
        targets: [{ format: 'rgba8unorm' }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });

    const crtLcd = await device.createRenderPipelineAsync({
      label: 'CRT/LCD Pipeline',
      layout: 'auto',
      vertex: {
        module: shaderModules.crtLcd,
        entryPoint: 'vertexMain'
      },
      fragment: {
        module: shaderModules.crtLcd,
        entryPoint: 'fragmentMain',
        targets: [{ format: canvasFormat }]
      },
      primitive: {
        topology: 'triangle-strip'
      }
    });

    return {
      pipelines: {
        pixelUpscale,
        unsharpMask,
        colorElevation,
        crtLcd
      },
      crtLcdBindGroupLayout: crtLcd.getBindGroupLayout(0)
    };
  }

  uploadFrame(imageBitmap: ImageBitmap): void {
    const { device, textures } = this._requireState();
    device.queue.copyExternalImageToTexture(
      { source: imageBitmap, flipY: true },
      { texture: textures.sourceTexture },
      [imageBitmap.width, imageBitmap.height]
    );
  }

  render(uniforms: RenderUniforms): void {
    if (this.hasError) {
      return;
    }

    const state = this._requireState();

    try {
      this._updateUniforms(state, uniforms);

      const commandEncoder = state.device.createCommandEncoder();
      let currentTextureIndex: 0 | 1 = 0;

      this._renderPass(
        state,
        commandEncoder,
        state.pipelines.pixelUpscale,
        state.textures.sourceTexture,
        state.textures.intermediateTextures[0],
        state.uniformBuffers.upscale,
        state.samplers.nearest
      );

      if (uniforms.unsharp.enabled && uniforms.unsharp.strength > 0) {
        const nextTextureIndex: 0 | 1 = currentTextureIndex === 0 ? 1 : 0;
        this._renderPass(
          state,
          commandEncoder,
          state.pipelines.unsharpMask,
          state.textures.intermediateTextures[currentTextureIndex],
          state.textures.intermediateTextures[nextTextureIndex],
          state.uniformBuffers.unsharp,
          state.samplers.linear
        );
        currentTextureIndex = nextTextureIndex;
      }

      if (uniforms.color.enabled) {
        const nextTextureIndex: 0 | 1 = currentTextureIndex === 0 ? 1 : 0;
        this._renderPass(
          state,
          commandEncoder,
          state.pipelines.colorElevation,
          state.textures.intermediateTextures[currentTextureIndex],
          state.textures.intermediateTextures[nextTextureIndex],
          state.uniformBuffers.color,
          state.samplers.linear
        );
        currentTextureIndex = nextTextureIndex;
      }

      const canvasTexture = state.context.getCurrentTexture();
      if (isCrtEnabled(uniforms)) {
        this._renderPassToCanvas(
          state,
          commandEncoder,
          state.pipelines.crtLcd,
          state.textures.intermediateTextures[currentTextureIndex],
          canvasTexture,
          state.uniformBuffers.crt,
          state.samplers.linear
        );
      } else {
        this._copyToCanvas(
          state,
          commandEncoder,
          state.textures.intermediateTextures[currentTextureIndex],
          canvasTexture
        );
      }

      state.device.queue.submit([commandEncoder.finish()]);
    } catch (error) {
      this.hasError = true;
      this.errorMessage = `Render error: ${getErrorMessage(error)}`;
      this._postError(this.errorMessage, 'RENDER_ERROR');
    }
  }

  private _postError(message: string, code: string): void {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message,
      code,
      adapterInfo: this.adapterInfo
    }));
  }

  private _buildAdapterInfo(adapter: GPUAdapter): AdapterInfo | null {
    try {
      const info = adapter.info;
      if (!info) {
        return null;
      }

      return {
        vendor: info.vendor || 'unknown',
        architecture: info.architecture || 'unknown',
        device: info.device || 'unknown',
        description: info.description || 'unknown'
      };
    } catch {
      return null;
    }
  }

  private _getIntermediateTextureView(state: WebGPUState, texture: GPUTexture): GPUTextureView {
    if (texture === state.textures.intermediateTextures[0]) {
      return state.textures.intermediateTextureViews[0];
    }
    if (texture === state.textures.intermediateTextures[1]) {
      return state.textures.intermediateTextureViews[1];
    }
    return texture.createView();
  }

  private _renderPass(
    state: WebGPUState,
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const bindGroup = this.bindGroupCache.getOrCreate(
      state.device,
      pipeline,
      uniformBuffer,
      inputTexture,
      sampler
    );

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this._getIntermediateTextureView(state, outputTexture),
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

  private _renderPassToCanvas(
    state: WebGPUState,
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const bindGroup = state.device.createBindGroup({
      layout: state.crtLcdBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: this._getIntermediateTextureView(state, inputTexture) },
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

  private _copyToCanvas(
    state: WebGPUState,
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    const bindGroup = state.device.createBindGroup({
      layout: state.crtLcdBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: state.uniformBuffers.crt } },
        { binding: 1, resource: this._getIntermediateTextureView(state, inputTexture) },
        { binding: 2, resource: state.samplers.linear }
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

    passEncoder.setPipeline(state.pipelines.crtLcd);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private _updateUniforms(state: WebGPUState, uniforms: RenderUniforms): void {
    const { nativeWidth, nativeHeight, targetWidth, targetHeight, scaleFactor } = state.config;

    const upscaleData = this.typedArrayPool.getFloat32WithValues([
      nativeWidth, nativeHeight,
      targetWidth, targetHeight,
      scaleFactor,
      0
    ]);

    if (this.uniformTracker.hasChanged('upscale', upscaleData)) {
      this._writeFloat32Buffer(state.device.queue, state.uniformBuffers.upscale, upscaleData);
    }

    const unsharpData = this.typedArrayPool.getFloat32WithValues([
      1.0 / targetWidth, 1.0 / targetHeight,
      uniforms.unsharp.strength,
      scaleFactor
    ]);

    if (this.uniformTracker.hasChanged('unsharp', unsharpData)) {
      this._writeFloat32Buffer(state.device.queue, state.uniformBuffers.unsharp, unsharpData);
    }

    const colorData = this.typedArrayPool.getFloat32WithValues([
      uniforms.color.gamma,
      uniforms.color.saturation,
      uniforms.color.greenBias,
      uniforms.color.brightness,
      uniforms.color.contrast,
      0, 0, 0
    ]);

    if (this.uniformTracker.hasChanged('color', colorData)) {
      this._writeFloat32Buffer(state.device.queue, state.uniformBuffers.color, colorData);
    }

    const crtData = this.typedArrayPool.getFloat32WithValues([
      targetWidth, targetHeight,
      scaleFactor,
      uniforms.crt.scanlineStrength,
      uniforms.crt.pixelMaskStrength,
      uniforms.crt.bloomStrength,
      uniforms.crt.curvature,
      uniforms.crt.vignetteStrength
    ]);

    if (this.uniformTracker.hasChanged('crt', crtData)) {
      this._writeFloat32Buffer(state.device.queue, state.uniformBuffers.crt, crtData);
    }
  }

  private _writeFloat32Buffer(queue: GPUQueue, buffer: GPUBuffer, data: Float32Array): void {
    queue.writeBuffer(buffer, 0, data.buffer as ArrayBuffer, data.byteOffset, data.byteLength);
  }

  resize(width: number, height: number): void {
    const state = this._requireState();
    state.config.targetWidth = width;
    state.config.targetHeight = height;

    for (const texture of state.textures.intermediateTextures) {
      texture.destroy();
    }

    const intermediateTextures = this._createIntermediateTextures(state.device, width, height);
    state.textures.intermediateTextures = intermediateTextures;
    state.textures.intermediateTextureViews = [
      intermediateTextures[0].createView(),
      intermediateTextures[1].createView()
    ];

    state.context.configure({
      device: state.device,
      format: state.canvasFormat,
      alphaMode: 'opaque'
    });

    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
  }

  destroy(): void {
    const state = this._state;
    if (!state) {
      return;
    }

    state.textures.sourceTexture.destroy();
    for (const texture of state.textures.intermediateTextures) {
      texture.destroy();
    }

    for (const buffer of Object.values(state.uniformBuffers)) {
      buffer.destroy();
    }

    state.device.destroy();
    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
    this._state = null;
  }
}

export {
  WebGPURenderer
};
