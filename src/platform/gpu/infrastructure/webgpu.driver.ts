import type { RenderPreset } from '../domain/types';
import {
  PRESENT_SHADER,
  WEBGPU_PASSES,
  buildUniforms,
  type PipelineUniforms,
  type WebGpuPass
} from './webgpu-passes.definitions';

export type WebGpuDriverConfig = {
  nativeWidth: number;
  nativeHeight: number;
  preset: RenderPreset;
  brightness: number;
};

type PassRuntime = {
  pass: WebGpuPass;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
};

const INTERMEDIATE_TARGET_COUNT = 2;

function clampBrightness(value: number): number {
  return Math.max(0, Math.min(2, value));
}

export class WebGpuDriver {
  private readonly nativeWidth: number;
  private readonly nativeHeight: number;
  private preset: RenderPreset;
  private brightness: number;
  private uniforms: PipelineUniforms;
  private uniformsDirty = true;
  private isActive = false;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat = 'rgba8unorm';
  private passes: PassRuntime[] = [];
  private presentPipeline: GPURenderPipeline | null = null;
  private sourceTexture: GPUTexture | null = null;
  private intermediateTextures: GPUTexture[] = [];
  private intermediateTextureViews: GPUTextureView[] = [];
  private nearestSampler: GPUSampler | null = null;
  private linearSampler: GPUSampler | null = null;
  private readonly bindGroups = new Map<string, GPUBindGroup>();

  private constructor(private readonly canvas: OffscreenCanvas, config: WebGpuDriverConfig) {
    this.nativeWidth = config.nativeWidth;
    this.nativeHeight = config.nativeHeight;
    this.preset = config.preset;
    this.brightness = clampBrightness(config.brightness);
    this.uniforms = this.buildUniforms();
  }

  static async create(canvas: OffscreenCanvas, config: WebGpuDriverConfig): Promise<WebGpuDriver> {
    const driver = new WebGpuDriver(canvas, config);
    try {
      await driver.initialize();
    } catch (error) {
      driver.dispose();
      throw error;
    }
    return driver;
  }

  private buildUniforms(): PipelineUniforms {
    return buildUniforms({
      preset: this.preset,
      nativeWidth: this.nativeWidth,
      nativeHeight: this.nativeHeight,
      outputWidth: this.canvas.width,
      outputHeight: this.canvas.height,
      brightness: this.brightness
    });
  }

  private async initialize(): Promise<void> {
    if (!navigator.gpu) {
      throw new Error('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })
      ?? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) {
      throw new Error('WebGPU adapter not available');
    }

    try {
      this.device = await adapter.requestDevice();
    } catch (error) {
      throw new Error('WebGPU device not available', { cause: error });
    }

    this.context = this.canvas.getContext('webgpu');
    if (!this.context) {
      throw new Error('WebGPU context not available');
    }

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.configureContext();
    await this.createPipelines();
    this.createSamplers();
    this.createResources();

    this.isActive = true;
    this.device.lost.then(() => {
      this.isActive = false;
    });
  }

  private configureContext(): void {
    this.context!.configure({
      device: this.device!,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });
  }

  private async createShaderModule(label: string, code: string): Promise<GPUShaderModule> {
    const module = this.device!.createShaderModule({ label, code });
    const compilationInfo = await module.getCompilationInfo();
    const errors = compilationInfo.messages.filter((message) => message.type === 'error');

    if (errors.length > 0) {
      const errorMsg = errors.map((error) => `${error.message} at line ${error.lineNum}`).join('; ');
      throw new Error(`Shader compilation error in ${label}: ${errorMsg}`);
    }

    return module;
  }

  private async createPipeline(label: string, code: string, format: GPUTextureFormat): Promise<GPURenderPipeline> {
    const module = await this.createShaderModule(`${label} shader`, code);
    return this.device!.createRenderPipelineAsync({
      label: `${label} pipeline`,
      layout: 'auto',
      vertex: { module, entryPoint: 'vertexMain' },
      fragment: { module, entryPoint: 'fragmentMain', targets: [{ format }] },
      primitive: { topology: 'triangle-strip' }
    });
  }

  private async createPipelines(): Promise<void> {
    const device = this.device!;

    for (const pass of WEBGPU_PASSES) {
      const pipeline = await this.createPipeline(pass.id, pass.shader, 'rgba8unorm');
      const uniformBuffer = device.createBuffer({
        label: `${pass.id} uniform buffer`,
        size: pass.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      this.passes.push({ pass, pipeline, uniformBuffer });
    }

    this.presentPipeline = await this.createPipeline('present', PRESENT_SHADER, this.canvasFormat);
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
    this.sourceTexture = this.device!.createTexture({
      label: 'Source Texture',
      size: [this.nativeWidth, this.nativeHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.createIntermediateTargets();
  }

  private createIntermediateTargets(): void {
    const [width, height] = this.uniforms.upscale.outputSize;

    this.destroyIntermediateTargets();
    for (let i = 0; i < INTERMEDIATE_TARGET_COUNT; i++) {
      const texture = this.device!.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [width, height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }
  }

  private destroyIntermediateTargets(): void {
    this.intermediateTextures.forEach((texture) => texture.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];
  }

  renderFrame(bitmap: ImageBitmap): void {
    if (!this.isActive || !this.device || !this.context || !this.sourceTexture) return;

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: bitmap, flipY: true },
        { texture: this.sourceTexture },
        [this.nativeWidth, this.nativeHeight]
      );

      if (this.uniformsDirty) {
        for (const { pass, uniformBuffer } of this.passes) {
          this.device.queue.writeBuffer(uniformBuffer, 0, pass.pack(this.uniforms));
        }
        this.uniformsDirty = false;
      }

      const commandEncoder = this.device.createCommandEncoder();
      let input = this.sourceTexture;
      let target = 0;
      for (const entry of this.passes) {
        if (!entry.pass.isEnabled(this.uniforms)) continue;
        this.renderPass(commandEncoder, entry, input, target);
        input = this.intermediateTextures[target];
        target ^= 1;
      }

      this.present(commandEncoder, input, this.context.getCurrentTexture());
      this.device.queue.submit([commandEncoder.finish()]);
    } catch {
      this.isActive = false;
    }
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    { pass, pipeline, uniformBuffer }: PassRuntime,
    input: GPUTexture,
    targetIndex: number
  ): void {
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.intermediateTextureViews[targetIndex],
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });

    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, this.getBindGroup(pipeline, uniformBuffer, input, pass.sampler));
    passEncoder.draw(4);
    passEncoder.end();
  }

  private getBindGroup(
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    input: GPUTexture,
    sampler: WebGpuPass['sampler']
  ): GPUBindGroup {
    const key = `${pipeline.label}:${input.label}`;
    let bindGroup = this.bindGroups.get(key);

    if (!bindGroup) {
      bindGroup = this.device!.createBindGroup({
        label: `Cached ${pipeline.label} BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: input.createView() },
          { binding: 2, resource: sampler === 'nearest' ? this.nearestSampler! : this.linearSampler! }
        ]
      });
      this.bindGroups.set(key, bindGroup);
    }

    return bindGroup;
  }

  private present(commandEncoder: GPUCommandEncoder, input: GPUTexture, canvasTexture: GPUTexture): void {
    const bindGroup = this.device!.createBindGroup({
      label: 'Present BindGroup',
      layout: this.presentPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: input.createView() },
        { binding: 1, resource: this.linearSampler! }
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

    passEncoder.setPipeline(this.presentPipeline!);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(4);
    passEncoder.end();
  }

  private updateUniforms(): void {
    this.uniforms = this.buildUniforms();
    this.uniformsDirty = true;
  }

  setPreset(preset: RenderPreset): void {
    this.preset = preset;
    this.updateUniforms();
  }

  setBrightness(value: number): void {
    this.brightness = clampBrightness(value);
    this.updateUniforms();
  }

  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.updateUniforms();

    if (!this.device || !this.context) return;

    this.createIntermediateTargets();
    this.configureContext();
    this.bindGroups.clear();
  }

  captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas);
  }

  dispose(): void {
    this.isActive = false;
    this.sourceTexture?.destroy();
    this.sourceTexture = null;
    this.destroyIntermediateTargets();
    this.passes.forEach(({ uniformBuffer }) => uniformBuffer.destroy());
    this.passes = [];
    this.bindGroups.clear();
    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.presentPipeline = null;
    this.nearestSampler = null;
    this.linearSampler = null;
  }
}
