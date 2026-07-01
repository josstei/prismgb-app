import type { PipelineState, RenderDriver } from './pipeline-controller';
import { loadWebGpuShaders } from './shaders';
import { RecoverableBackendInitializationError } from '../domain/errors';
import type { PipelineUniforms } from '../domain/uniforms';
import {
  compileRenderPasses,
  createRenderPassPlan,
  getEnabledRenderPasses,
  readFiniteNumber,
  readFiniteNumberPair,
  readUniformSourceValue,
  type CompiledRenderPass,
  type RenderPlanSource,
  type RenderPlanTarget
} from '../application/passes';
import type { RenderPassDefinition, WebGpuUniformMemberSpec } from '../domain/pass-specs';

type WebGpuUniformMember = WebGpuUniformMemberSpec;

type WebGpuUniformLayout = {
  passId: string;
  uniformBlock: string;
  byteLength: number;
  members: readonly WebGpuUniformMember[];
};

type WebGpuPassState = {
  shaderFile: string;
  layout: WebGpuUniformLayout;
  uniformData(uniforms: PipelineUniforms): Float32Array;
};

type WebGpuRenderPass = CompiledRenderPass<WebGpuPassState>;

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

function normalizeWebGpuUniformLayout(pass: RenderPassDefinition): WebGpuUniformLayout {
  return {
    passId: pass.id,
    uniformBlock: pass.uniformBlock,
    byteLength: pass.webgpuUniformLayout.byteLength,
    members: pass.webgpuUniformLayout.members
  };
}

function writeWebGpuUniformMember(
  output: Float32Array,
  member: WebGpuUniformMember,
  uniforms: PipelineUniforms
): void {
  const outputIndex = member.offsetBytes / Float32Array.BYTES_PER_ELEMENT;
  if (!Number.isInteger(outputIndex)) {
    throw new Error(`WebGPU uniform member '${member.name}' offset must be 4-byte aligned`);
  }

  const value = readUniformSourceValue(uniforms, member.source);
  if (member.type === 'vec2<f32>') {
    const [x, y] = readFiniteNumberPair(value, `WebGPU uniform member '${member.name}'`);
    output[outputIndex] = x;
    output[outputIndex + 1] = y;
    return;
  }

  output[outputIndex] = readFiniteNumber(value, `WebGPU uniform member '${member.name}'`);
}

function buildWebGpuUniformDataBuilder(
  layout: WebGpuUniformLayout
): (uniforms: PipelineUniforms) => Float32Array {
  if (layout.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`WebGPU uniform layout for pass '${layout.passId}' must be 4-byte aligned`);
  }

  return (uniforms) => {
    const output = new Float32Array(layout.byteLength / Float32Array.BYTES_PER_ELEMENT);
    for (const member of layout.members) {
      writeWebGpuUniformMember(output, member, uniforms);
    }

    return output;
  };
}

function compileWebGpuPassState(pass: RenderPassDefinition): WebGpuPassState {
  const layout = normalizeWebGpuUniformLayout(pass);

  return {
    shaderFile: pass.webgpuShader,
    layout: { ...layout },
    uniformData: buildWebGpuUniformDataBuilder(layout)
  };
}

export const WEBGPU_RENDER_PASSES = compileRenderPasses<WebGpuPassState>({
  backendName: 'webgpu',
  compile: compileWebGpuPassState
});

export class WebGpuDriver implements RenderDriver {
  readonly backend = 'webgpu' as const;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;

  private renderPipelines: RenderPipelines | null = null;

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
    const shaders = loadWebGpuShaders();

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

    const pipelines = new Map<string, GPURenderPipeline>();
    for (const pass of WEBGPU_RENDER_PASSES) {
      const shaderSource = shaders.byFileName[pass.backend.shaderFile];
      if (!shaderSource) {
        throw new Error(`Missing WebGPU shader source for pass '${pass.passId}'`);
      }

      const shaderModule = await createAndValidate(`${pass.passId} shader`, shaderSource);
      const descriptor: GPURenderPipelineDescriptor = {
        label: `${pass.passId} pipeline`,
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vertexMain' },
        fragment: {
          module: shaderModule,
          entryPoint: 'fragmentMain',
          targets: [{ format: pass.outputsToCanvas ? this.canvasFormat! : 'rgba8unorm' }]
        },
        primitive: { topology: 'triangle-strip' }
      };

      const createNativeRenderPipelineAsync = device[CREATE_NATIVE_RENDER_PIPELINE_ASYNC] as unknown as (
        descriptor: GPURenderPipelineDescriptor
      ) => Promise<GPURenderPipeline>;
      if (typeof createNativeRenderPipelineAsync !== 'function') {
        throw new Error('WebGPU device cannot create render pipelines asynchronously');
      }

      pipelines.set(
        pass.passId,
        await createNativeRenderPipelineAsync.call(device, descriptor)
      );
    }

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
    for (const pass of WEBGPU_RENDER_PASSES) {
      uniformBuffers.set(pass.passId, device.createBuffer({
        label: `${pass.passId} uniform buffer`,
        size: pass.backend.layout.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }));
    }

    this.uniformBuffers = uniformBuffers;
  }

  renderFrame(source: TexImageSource, state: PipelineState): void {
    if (!state.isActive || !this.device || !this.context || this.hasError) return;
    if (!this.renderPipelines || !this.uniformBuffers || !this.sourceTexture) return;

    const startTime = performance.now();

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as ImageBitmap, flipY: true },
        { texture: this.sourceTexture },
        [state.nativeWidth, state.nativeHeight]
      );

      this.uploadUniforms(state);

      const commandEncoder = this.device.createCommandEncoder();
      const plan = createRenderPassPlan(
        getEnabledRenderPasses(WEBGPU_RENDER_PASSES, state.uniforms, state.preset),
        this.intermediateTextures.length
      );

      for (const step of plan.steps) {
        const { pass } = step;
        const pipeline = this.renderPipelines.get(pass.passId);
        const uniformBuffer = this.uniformBuffers.get(pass.passId);
        const sampler = pass.sampler === 'nearest'
          ? this.nearestSampler!
          : this.linearSampler!;

        if (!pipeline || !uniformBuffer || !sampler) {
          throw new Error(`Missing pass runtime state for '${pass.passId}'`);
        }

        this.renderPass(
          commandEncoder,
          pass,
          pipeline,
          this.resolvePlanTexture(step.source),
          this.resolvePlanTargetTexture(step.target),
          uniformBuffer,
          sampler
        );
      }

      if (plan.finalCanvasCopy.required) {
        this.copyToCanvas(
          commandEncoder,
          this.resolvePlanTexture(plan.finalCanvasCopy.source),
          this.context.getCurrentTexture()
        );
      }

      this.device.queue.submit([commandEncoder.finish()]);
      state.recordFrame(performance.now() - startTime);
    } catch {
      this.hasError = true;
      state.deactivate();
    }
  }

  private resolvePlanTexture(source: RenderPlanSource): GPUTexture {
    return source.kind === 'source'
      ? this.sourceTexture!
      : this.intermediateTextures[source.index];
  }

  private resolvePlanTargetTexture(target: RenderPlanTarget): GPUTexture {
    return target.kind === 'canvas'
      ? this.context!.getCurrentTexture()
      : this.intermediateTextures[target.index];
  }

  private getPassSampler(pass: WebGpuRenderPass): GPUSampler {
    return pass.sampler === 'nearest' ? this.nearestSampler! : this.linearSampler!;
  }

  private getCanvasOutputPass(): WebGpuRenderPass {
    const pass = WEBGPU_RENDER_PASSES.find((candidate) => candidate.outputsToCanvas);
    if (!pass) {
      throw new Error('No render pass is configured to output to canvas');
    }

    return pass;
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pass: WebGpuRenderPass,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    const bindGroup = this.bindGroupStore.getOrCreate(
      this.device!,
      pipeline,
      uniformBuffer,
      inputTexture,
      sampler
    );

    const outputIndex = this.intermediateTextures.indexOf(outputTexture);
    const outputView = pass.outputsToCanvas
      ? outputTexture.createView()
      : this.intermediateTextureViews[outputIndex];

    if (!outputView) {
      throw new Error(`Invalid output target for pass '${pass.passId}'`);
    }

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

  private copyToCanvas(
    commandEncoder: GPUCommandEncoder,
    sourceTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    const pass = this.getCanvasOutputPass();
    const pipeline = this.renderPipelines!.get(pass.passId)!;
    const uniformBuffer = this.uniformBuffers!.get(pass.passId)!;
    const sampler = this.getPassSampler(pass);

    this.renderPass(
      commandEncoder,
      pass,
      pipeline,
      sourceTexture,
      canvasTexture,
      uniformBuffer,
      sampler
    );
  }

  private uploadUniforms(state: PipelineState): void {
    const device = this.device!;
    for (const pass of WEBGPU_RENDER_PASSES) {
      const uniformData = pass.backend.uniformData(state.uniforms);
      const buffer = this.uniformBuffers!.get(pass.passId);
      if (!buffer) {
        throw new Error(`Missing uniform buffer for pass '${pass.passId}'`);
      }

      if (this.uniformChangeTracker.hasChanged(pass.passId, uniformData)) {
        device.queue.writeBuffer(buffer, 0, uniformData as unknown as ArrayBuffer);
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
    this.nearestSampler = null;
    this.linearSampler = null;
    this.hasError = false;
    this.bindGroupStore.invalidate();
  }
}
