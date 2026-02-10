import { BasePipeline } from '../base-pipeline';
import { loadShaders } from './webgpu-shader-loader';
import { BindGroupCache } from './bind-group-cache';
import { UniformTracker } from '../optimization/uniform-tracker';
import { TypedArrayPool } from '../optimization/typed-array-pool';
import type { FrameSource } from '../../domain/frame';
import type { PipelineUniforms } from '../../domain/shaders';
import type { IPipelineOptions, RenderAPI, IAdapterInfo } from '../../domain/pipeline';
import type { IPreset } from '../../domain/presets';

interface RenderPipelines {
  pixelUpscale: GPURenderPipeline;
  unsharpMask: GPURenderPipeline;
  colorElevation: GPURenderPipeline;
  crtLcd: GPURenderPipeline;
}

interface UniformBuffers {
  upscale: GPUBuffer;
  unsharp: GPUBuffer;
  color: GPUBuffer;
  crt: GPUBuffer;
}

interface ShaderModules {
  pixelUpscale: GPUShaderModule;
  unsharpMask: GPUShaderModule;
  colorElevation: GPUShaderModule;
  crtLcd: GPUShaderModule;
}

export class WebGPUPipeline extends BasePipeline {
  readonly api: RenderAPI = 'webgpu';

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;
  private adapter: GPUAdapter | null = null;

  private shaderModules: ShaderModules | null = null;
  private renderPipelines: RenderPipelines | null = null;
  private crtLcdBindGroupLayout: GPUBindGroupLayout | null = null;

  private sourceTexture: GPUTexture | null = null;
  private intermediateTextures: GPUTexture[] = [];
  private intermediateTextureViews: GPUTextureView[] = [];

  private nearestSampler: GPUSampler | null = null;
  private linearSampler: GPUSampler | null = null;

  private uniformBuffers: UniformBuffers | null = null;

  private bindGroupCache = new BindGroupCache();
  private uniformTracker = new UniformTracker();
  private arrayPool = new TypedArrayPool(3, [4, 6, 8, 16, 32]);

  private currentPreset: IPreset | null = null;

  getAdapterInfo(): IAdapterInfo | null {
    if (!this.adapter) return null;

    const info = this.adapter.info;
    return {
      vendor: info.vendor,
      architecture: info.architecture,
      device: info.device,
      description: info.description,
      api: 'webgpu'
    };
  }

  protected async onInitialize(options: IPipelineOptions): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    this.adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })
      ?? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!this.adapter) {
      throw new Error('WebGPU adapter not available');
    }

    this.device = await this.adapter.requestDevice();

    this.device.lost.then(() => {
      this.handleError('DEVICE_LOST', 'GPU device was lost', false);
    });

    const canvasElement = this.canvas as HTMLCanvasElement;
    this.context = canvasElement.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new Error('WebGPU context not available');
    }

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });

    await this.createShaderModules();
    this.createSamplers();
    this.createResources();
    await this.createPipelines();

    this.currentPreset = options.preset ?? null;
  }

  private async createShaderModules(): Promise<void> {
    const device = this.device!;
    const shaders = loadShaders();

    const createAndValidate = async (label: string, code: string): Promise<GPUShaderModule> => {
      const module = device.createShaderModule({ label, code });
      const compilationInfo = await module.getCompilationInfo();
      const errors = compilationInfo.messages.filter(m => m.type === 'error');

      if (errors.length > 0) {
        const errorMsg = errors.map(e => `${e.message} at line ${e.lineNum}`).join('; ');
        throw new Error(`Shader compilation error in ${label}: ${errorMsg}`);
      }

      return module;
    };

    this.shaderModules = {
      pixelUpscale: await createAndValidate('Pixel Upscale Shader', shaders.pixelUpscale),
      unsharpMask: await createAndValidate('Unsharp Mask Shader', shaders.unsharpMask),
      colorElevation: await createAndValidate('Color Elevation Shader', shaders.colorElevation),
      crtLcd: await createAndValidate('CRT/LCD Shader', shaders.crtLcd)
    };
  }

  private createSamplers(): void {
    const device = this.device!;

    this.nearestSampler = device.createSampler({
      label: 'Nearest Sampler',
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });

    this.linearSampler = device.createSampler({
      label: 'Linear Sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge'
    });
  }

  private createResources(): void {
    const device = this.device!;

    this.sourceTexture = device.createTexture({
      label: 'Source Texture',
      size: [this.nativeWidth, this.nativeHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.intermediateTextures = [];
    this.intermediateTextureViews = [];
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [this.targetWidth, this.targetHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    this.uniformBuffers = {
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

  private async createPipelines(): Promise<void> {
    const device = this.device!;
    const modules = this.shaderModules!;

    const pipelineDescriptor = (
      label: string,
      module: GPUShaderModule,
      format: GPUTextureFormat
    ): GPURenderPipelineDescriptor => ({
      label,
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-strip' }
    });

    this.renderPipelines = {
      pixelUpscale: await device.createRenderPipelineAsync(
        pipelineDescriptor('Pixel Upscale Pipeline', modules.pixelUpscale, 'rgba8unorm')
      ),
      unsharpMask: await device.createRenderPipelineAsync(
        pipelineDescriptor('Unsharp Mask Pipeline', modules.unsharpMask, 'rgba8unorm')
      ),
      colorElevation: await device.createRenderPipelineAsync(
        pipelineDescriptor('Color Elevation Pipeline', modules.colorElevation, 'rgba8unorm')
      ),
      crtLcd: await device.createRenderPipelineAsync(
        pipelineDescriptor('CRT/LCD Pipeline', modules.crtLcd, this.canvasFormat!)
      )
    };

    this.crtLcdBindGroupLayout = this.renderPipelines.crtLcd.getBindGroupLayout(0);
  }

  protected onRenderFrame(source: FrameSource, uniforms: PipelineUniforms): void {
    if (!this.device || !this.context) return;
    if (!this.renderPipelines || !this.uniformBuffers || !this.sourceTexture) return;

    this.device.queue.copyExternalImageToTexture(
      { source: source as ImageBitmap, flipY: true },
      { texture: this.sourceTexture },
      [this.nativeWidth, this.nativeHeight]
    );

    this.uploadUniforms(uniforms);

    const commandEncoder = this.device.createCommandEncoder();
    let currentTexture = 0;

    this.renderPass(
      commandEncoder,
      this.renderPipelines.pixelUpscale,
      this.sourceTexture,
      this.intermediateTextures[0],
      this.uniformBuffers.upscale,
      this.nearestSampler!
    );
    currentTexture = 0;

    if (this.currentPreset?.unsharp.enabled && uniforms.unsharp.strength > 0) {
      const nextTexture = (currentTexture + 1) % 2;
      this.renderPass(
        commandEncoder,
        this.renderPipelines.unsharpMask,
        this.intermediateTextures[currentTexture],
        this.intermediateTextures[nextTexture],
        this.uniformBuffers.unsharp,
        this.linearSampler!
      );
      currentTexture = nextTexture;
    }

    if (this.currentPreset?.color.enabled) {
      const nextTexture = (currentTexture + 1) % 2;
      this.renderPass(
        commandEncoder,
        this.renderPipelines.colorElevation,
        this.intermediateTextures[currentTexture],
        this.intermediateTextures[nextTexture],
        this.uniformBuffers.color,
        this.linearSampler!
      );
      currentTexture = nextTexture;
    }

    const canvasTexture = this.context.getCurrentTexture();
    const { crt } = uniforms;
    const crtEnabled = crt.scanlineStrength > 0 || crt.pixelMaskStrength > 0 ||
      crt.bloomStrength > 0 || crt.curvature > 0 || crt.vignetteStrength > 0;

    if (crtEnabled) {
      this.renderPassToCanvas(
        commandEncoder,
        this.renderPipelines.crtLcd,
        this.intermediateTextures[currentTexture],
        canvasTexture,
        this.uniformBuffers.crt,
        this.linearSampler!
      );
    } else {
      this.copyToCanvas(
        commandEncoder,
        this.intermediateTextures[currentTexture],
        canvasTexture
      );
    }

    this.device.queue.submit([commandEncoder.finish()]);
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const bindGroup = this.bindGroupCache.getOrCreate(
      this.device!,
      pipeline,
      uniformBuffer,
      inputTexture,
      sampler
    );

    const outputIndex = this.intermediateTextures.indexOf(outputTexture);
    const outputView = outputIndex >= 0
      ? this.intermediateTextureViews[outputIndex]
      : outputTexture.createView();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: outputView,
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

  private renderPassToCanvas(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const inputIndex = this.intermediateTextures.indexOf(inputTexture);
    const inputView = inputIndex >= 0
      ? this.intermediateTextureViews[inputIndex]
      : inputTexture.createView();

    const bindGroup = this.device!.createBindGroup({
      layout: this.crtLcdBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputView },
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

  private copyToCanvas(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    const inputIndex = this.intermediateTextures.indexOf(inputTexture);
    const inputView = inputIndex >= 0
      ? this.intermediateTextureViews[inputIndex]
      : inputTexture.createView();

    const bindGroup = this.device!.createBindGroup({
      layout: this.crtLcdBindGroupLayout!,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffers!.crt } },
        { binding: 1, resource: inputView },
        { binding: 2, resource: this.linearSampler! }
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

    passEncoder.setPipeline(this.renderPipelines!.crtLcd);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private uploadUniforms(uniforms: PipelineUniforms): void {
    const device = this.device!;
    const buffers = this.uniformBuffers!;
    const { upscale, unsharp, color, crt } = uniforms;

    const upscaleData = this.arrayPool.getFloat32WithValues([
      upscale.inputSize[0], upscale.inputSize[1],
      upscale.outputSize[0], upscale.outputSize[1],
      upscale.scaleFactor,
      0
    ]);
    if (this.uniformTracker.hasChanged('upscale', upscaleData)) {
      device.queue.writeBuffer(buffers.upscale, 0, upscaleData.buffer, upscaleData.byteOffset, upscaleData.byteLength);
    }

    const unsharpData = this.arrayPool.getFloat32WithValues([
      unsharp.texelSize[0], unsharp.texelSize[1],
      unsharp.strength,
      unsharp.scaleFactor
    ]);
    if (this.uniformTracker.hasChanged('unsharp', unsharpData)) {
      device.queue.writeBuffer(buffers.unsharp, 0, unsharpData.buffer, unsharpData.byteOffset, unsharpData.byteLength);
    }

    const colorData = this.arrayPool.getFloat32WithValues([
      color.gamma,
      color.saturation,
      color.greenBias,
      color.brightness,
      color.contrast,
      0, 0, 0
    ]);
    if (this.uniformTracker.hasChanged('color', colorData)) {
      device.queue.writeBuffer(buffers.color, 0, colorData.buffer, colorData.byteOffset, colorData.byteLength);
    }

    const crtData = this.arrayPool.getFloat32WithValues([
      crt.resolution[0], crt.resolution[1],
      crt.scaleFactor,
      crt.scanlineStrength,
      crt.pixelMaskStrength,
      crt.bloomStrength,
      crt.curvature,
      crt.vignetteStrength
    ]);
    if (this.uniformTracker.hasChanged('crt', crtData)) {
      device.queue.writeBuffer(buffers.crt, 0, crtData.buffer, crtData.byteOffset, crtData.byteLength);
    }
  }

  protected onResize(width: number, height: number): void {
    if (!this.device || !this.context) return;

    this.intermediateTextures.forEach(tex => tex.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    for (let i = 0; i < 2; i++) {
      const texture = this.device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    this.context.configure({
      device: this.device,
      format: this.canvasFormat!,
      alphaMode: 'opaque'
    });

    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
  }

  protected onSuspend(): void {
  }

  protected async onResume(): Promise<void> {
  }

  protected onDispose(): void {
    this.sourceTexture?.destroy();
    this.sourceTexture = null;
    this.intermediateTextures.forEach(tex => tex.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    if (this.uniformBuffers) {
      Object.values(this.uniformBuffers).forEach(buf => buf.destroy());
      this.uniformBuffers = null;
    }

    this.bindGroupCache.invalidate();
    this.device?.destroy();
    this.device = null;
    this.adapter = null;
    this.context = null;
    this.renderPipelines = null;
    this.shaderModules = null;
    this.crtLcdBindGroupLayout = null;
    this.nearestSampler = null;
    this.linearSampler = null;
    this.currentPreset = null;
  }
}
