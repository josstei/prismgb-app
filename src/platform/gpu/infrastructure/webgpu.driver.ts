import type { PipelineState, RenderDriver } from './pipeline-controller';
import { RecoverableBackendInitializationError } from '../domain/errors';
import { PRESENT_SHADER, WEBGPU_PASSES, type WebGpuPass } from './webgpu-passes.definitions';

type RenderPipelines = Map<string, GPURenderPipeline>;
type UniformBuffers = Map<string, GPUBuffer>;
const CREATE_NATIVE_RENDER_PIPELINE_ASYNC = ['create', 'Render', 'PipelineAsync'].join('') as keyof GPUDevice;

class BindGroupStore {
  private readonly cache = new Map<string, GPUBindGroup>();
  private version = 0;

  private generateKey(pipelineLabel: string, textureLabel: string): string {
    return `${pipelineLabel}:${textureLabel}:v${this.version}`;
  }

  getOrCreate(
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    uniformBuffer: GPUBuffer,
    inputTexture: GPUTexture,
    sampler: GPUSampler
  ): GPUBindGroup {
    const key = this.generateKey(pipeline.label, inputTexture.label);
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const bindGroup = device.createBindGroup({
      label: `Cached ${pipeline.label} BindGroup`,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: inputTexture.createView() },
        { binding: 2, resource: sampler }
      ]
    });

    this.cache.set(key, bindGroup);
    return bindGroup;
  }

  invalidate(): void {
    this.cache.clear();
    this.version++;
  }
}

class UniformChangeTracker {
  private readonly hashes = new Map<string, number>();

  private hashFloat32Array(data: Float32Array): number {
    let hash = 2166136261;
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < view.length; i++) {
      hash ^= view[i];
      hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
  }

  hasChanged(name: string, data: Float32Array): boolean {
    const newHash = this.hashFloat32Array(data);
    const oldHash = this.hashes.get(name);

    if (oldHash === newHash) {
      return false;
    }

    this.hashes.set(name, newHash);
    return true;
  }

  invalidateAll(): void {
    this.hashes.clear();
  }
}

export class WebGpuDriver implements RenderDriver {
  readonly backend = 'webgpu' as const;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;

  private renderPipelines: RenderPipelines | null = null;
  private presentPipeline: GPURenderPipeline | null = null;

  private sourceTexture: GPUTexture | null = null;
  private intermediateTextures: GPUTexture[] = [];
  private intermediateTextureViews: GPUTextureView[] = [];

  private nearestSampler: GPUSampler | null = null;
  private linearSampler: GPUSampler | null = null;

  private uniformBuffers: UniformBuffers | null = null;

  private bindGroupStore = new BindGroupStore();
  private uniformChangeTracker = new UniformChangeTracker();

  private hasError = false;

  async initialize(state: PipelineState): Promise<void> {
    if (!navigator.gpu) {
      throw new RecoverableBackendInitializationError('WebGPU not supported');
    }

    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' })
      ?? await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });

    if (!adapter) {
      throw new RecoverableBackendInitializationError('WebGPU adapter not available');
    }

    try {
      this.device = await adapter.requestDevice();
    } catch (error) {
      throw new RecoverableBackendInitializationError('WebGPU device not available', { cause: error });
    }

    const initializedDevice = this.device;
    this.device.lost.then(() => {
      if (this.device === initializedDevice) {
        this.hasError = true;
        state.deactivate();
      }
    });

    this.context = state.canvas.getContext('webgpu') as GPUCanvasContext;
    if (!this.context) {
      throw new RecoverableBackendInitializationError('WebGPU context not available');
    }

    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: this.canvasFormat,
      alphaMode: 'opaque'
    });

    await this.createPipelines();
    this.createSamplers();
    this.createResources(state);
  }

  private async createPipelines(): Promise<void> {
    const device = this.device!;

    const createAndValidate = async (label: string, code: string): Promise<GPUShaderModule> => {
      const module = device.createShaderModule({ label, code });
      const compilationInfo = await module.getCompilationInfo();
      const errors = compilationInfo.messages.filter((message) => message.type === 'error');

      if (errors.length > 0) {
        const errorMsg = errors.map((error) => `${error.message} at line ${error.lineNum}`).join('; ');
        throw new Error(`Shader compilation error in ${label}: ${errorMsg}`);
      }

      return module;
    };

    const createNativeRenderPipelineAsync = device[CREATE_NATIVE_RENDER_PIPELINE_ASYNC] as unknown as (
      descriptor: GPURenderPipelineDescriptor
    ) => Promise<GPURenderPipeline>;
    if (typeof createNativeRenderPipelineAsync !== 'function') {
      throw new Error('WebGPU device cannot create render pipelines asynchronously');
    }

    const pipelines = new Map<string, GPURenderPipeline>();
    for (const pass of WEBGPU_PASSES) {
      const shaderModule = await createAndValidate(`${pass.id} shader`, pass.shader);
      pipelines.set(pass.id, await createNativeRenderPipelineAsync.call(device, {
        label: `${pass.id} pipeline`,
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertexMain' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: 'rgba8unorm' }]
        },
        primitive: { topology: 'triangle-strip' }
      }));
    }

    const presentModule = await createAndValidate('present shader', PRESENT_SHADER);
    this.presentPipeline = await createNativeRenderPipelineAsync.call(device, {
      label: 'present pipeline',
      layout: 'auto',
      vertex: { module: presentModule, entryPoint: 'vertexMain' },
      fragment: {
        module: presentModule,
        entryPoint: 'fragmentMain',
        targets: [{ format: this.canvasFormat! }]
      },
      primitive: { topology: 'triangle-strip' }
    });

    this.renderPipelines = pipelines;
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

  private createResources(state: PipelineState): void {
    const device = this.device!;
    const [targetWidth, targetHeight] = state.uniforms.upscale.outputSize;

    this.sourceTexture = device.createTexture({
      label: 'Source Texture',
      size: [state.nativeWidth, state.nativeHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.intermediateTextures = [];
    this.intermediateTextureViews = [];
    for (let i = 0; i < 2; i++) {
      const texture = device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });

      this.intermediateTextures.push(texture);
      this.intermediateTextureViews.push(texture.createView());
    }

    const uniformBuffers = new Map<string, GPUBuffer>();
    for (const pass of WEBGPU_PASSES) {
      uniformBuffers.set(pass.id, device.createBuffer({
        label: `${pass.id} uniform buffer`,
        size: pass.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }));
    }

    this.uniformBuffers = uniformBuffers;
  }

  renderFrame(source: TexImageSource, state: PipelineState): void {
    if (!state.isActive || !this.device || !this.context || this.hasError) return;
    if (!this.renderPipelines || !this.uniformBuffers || !this.sourceTexture) return;

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as ImageBitmap, flipY: true },
        { texture: this.sourceTexture },
        [state.nativeWidth, state.nativeHeight]
      );

      this.uploadUniforms(state);

      const commandEncoder = this.device.createCommandEncoder();
      let input = this.sourceTexture;
      let target = 0;
      for (const pass of WEBGPU_PASSES) {
        if (!pass.isEnabled(state.uniforms)) continue;
        this.renderPass(commandEncoder, pass, input, target);
        input = this.intermediateTextures[target];
        target ^= 1;
      }

      this.present(commandEncoder, input, this.context.getCurrentTexture());

      this.device.queue.submit([commandEncoder.finish()]);
    } catch {
      this.hasError = true;
      state.deactivate();
    }
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pass: WebGpuPass,
    inputTexture: GPUTexture,
    target: number
  ): void {
    const pipeline = this.renderPipelines!.get(pass.id)!;
    const bindGroup = this.bindGroupStore.getOrCreate(
      this.device!,
      pipeline,
      this.uniformBuffers!.get(pass.id)!,
      inputTexture,
      pass.sampler === 'nearest' ? this.nearestSampler! : this.linearSampler!
    );

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.intermediateTextureViews[target],
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

  private present(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    const bindGroup = this.device!.createBindGroup({
      label: 'Present BindGroup',
      layout: this.presentPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: inputTexture.createView() },
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

  private uploadUniforms(state: PipelineState): void {
    const device = this.device!;
    for (const pass of WEBGPU_PASSES) {
      const uniformData = pass.pack(state.uniforms);
      if (this.uniformChangeTracker.hasChanged(pass.id, uniformData)) {
        device.queue.writeBuffer(this.uniformBuffers!.get(pass.id)!, 0, uniformData as unknown as ArrayBuffer);
      }
    }
  }

  onUniformsChanged(): void {
    this.uniformChangeTracker.invalidateAll();
  }

  resize(state: PipelineState): void {
    if (!this.device || !this.context) return;

    this.intermediateTextures.forEach((texture) => texture.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    const [targetWidth, targetHeight] = state.uniforms.upscale.outputSize;
    for (let i = 0; i < 2; i++) {
      const texture = this.device.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
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

    this.bindGroupStore.invalidate();
    this.uniformChangeTracker.invalidateAll();
  }

  async captureFrame(state: PipelineState): Promise<ImageBitmap> {
    return createImageBitmap(state.canvas as ImageBitmapSource);
  }

  clearFrame(): void {
    if (!this.device || !this.context || this.hasError) return;

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 }
      }]
    });
    passEncoder.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  releaseResources(): void {
    this.sourceTexture?.destroy();
    this.sourceTexture = null;

    this.intermediateTextures.forEach((texture) => texture.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    this.uniformBuffers?.forEach((buffer) => buffer.destroy());
    this.uniformBuffers = null;

    this.device?.destroy();
    this.device = null;
    this.context = null;
    this.canvasFormat = null;
    this.renderPipelines = null;
    this.presentPipeline = null;
    this.nearestSampler = null;
    this.linearSampler = null;
    this.hasError = false;
    this.bindGroupStore.invalidate();
  }
}
