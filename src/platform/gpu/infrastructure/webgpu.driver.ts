import type { PipelineState, RenderDriver } from './pipeline-controller';
import { loadWebGpuShaders } from './shaders';
import { RecoverableBackendInitializationError } from '../domain/errors';
import { PASS_SPECS, type RenderPassDefinition } from '../domain/pass-specs';
import {
  createRenderPassPlan,
  getEnabledRenderPasses,
  packUniforms,
  type RenderPassPlan,
  type RenderPlanSource,
  type RenderPlanTarget
} from '../application/passes';

export class WebGpuDriver implements RenderDriver {
  readonly backend = 'webgpu' as const;

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat | null = null;

  private renderPipelines: Map<string, GPURenderPipeline> | null = null;
  private presentPipeline: GPURenderPipeline | null = null;

  private sourceTexture: GPUTexture | null = null;
  private intermediateTextures: GPUTexture[] = [];

  private nearestSampler: GPUSampler | null = null;
  private linearSampler: GPUSampler | null = null;

  private uniformBuffers: Map<string, GPUBuffer> | null = null;

  private readonly textureViews = new Map<GPUTexture, GPUTextureView>();
  private readonly bindGroups = new Map<GPURenderPipeline, Map<GPUTexture, GPUBindGroup>>();
  private readonly presentBindGroups = new Map<GPUTexture, GPUBindGroup>();
  private readonly uniformData = new Map<string, Float32Array<ArrayBuffer>>();
  private uniformsDirty = true;
  private renderPlan: RenderPassPlan<RenderPassDefinition> | null = null;

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
    for (const pass of PASS_SPECS) {
      const shaderSource = shaders.byFileName[pass.webgpuShader];
      if (!shaderSource) {
        throw new Error(`Missing WebGPU shader source for pass '${pass.id}'`);
      }

      const shaderModule = await createAndValidate(`${pass.id} shader`, shaderSource);
      pipelines.set(pass.id, await device.createRenderPipelineAsync({
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

    const presentShaderSource = shaders.byFileName['present.wgsl'];
    if (!presentShaderSource) {
      throw new Error('Missing WebGPU present shader source');
    }
    const presentModule = await createAndValidate('present shader', presentShaderSource);
    this.presentPipeline = await device.createRenderPipelineAsync({
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
    this.sourceTexture = device.createTexture({
      label: 'Source Texture',
      size: [state.nativeWidth, state.nativeHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    });

    this.textureViews.set(this.sourceTexture, this.sourceTexture.createView());
    this.replaceIntermediateTextures(state);

    const uniformBuffers = new Map<string, GPUBuffer>();
    for (const pass of PASS_SPECS) {
      this.uniformData.set(pass.id, new Float32Array(pass.uniforms.byteLength / 4));
      uniformBuffers.set(pass.id, device.createBuffer({
        label: `${pass.id} uniform buffer`,
        size: pass.uniforms.byteLength,
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
      const plan = this.renderPlan!;

      for (const step of plan.steps) {
        const { pass } = step;
        const pipeline = this.renderPipelines.get(pass.id);
        const uniformBuffer = this.uniformBuffers.get(pass.id);
        const sampler = pass.sampler === 'nearest'
          ? this.nearestSampler!
          : this.linearSampler!;

        if (!pipeline || !uniformBuffer || !sampler) {
          throw new Error(`Missing pass runtime state for '${pass.id}'`);
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

      this.present(
        commandEncoder,
        this.resolvePlanTexture(plan.presentSource),
        this.context.getCurrentTexture()
      );

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
    return this.intermediateTextures[target.index];
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pass: RenderPassDefinition,
    pipeline: GPURenderPipeline,
    inputTexture: GPUTexture,
    outputTexture: GPUTexture,
    uniformBuffer: GPUBuffer,
    sampler: GPUSampler
  ): void {
    let pipelineGroups = this.bindGroups.get(pipeline);
    if (!pipelineGroups) {
      pipelineGroups = new Map();
      this.bindGroups.set(pipeline, pipelineGroups);
    }
    let bindGroup = pipelineGroups.get(inputTexture);
    if (!bindGroup) {
      bindGroup = this.device!.createBindGroup({
        label: `Cached ${pipeline.label} BindGroup`,
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: this.textureViews.get(inputTexture)! },
          { binding: 2, resource: sampler }
        ]
      });
      pipelineGroups.set(inputTexture, bindGroup);
    }

    const outputView = this.textureViews.get(outputTexture);

    if (!outputView) {
      throw new Error(`Invalid output target for pass '${pass.id}'`);
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

  private present(
    commandEncoder: GPUCommandEncoder,
    inputTexture: GPUTexture,
    canvasTexture: GPUTexture
  ): void {
    let bindGroup = this.presentBindGroups.get(inputTexture);
    if (!bindGroup) {
      bindGroup = this.device!.createBindGroup({
        label: 'Present BindGroup',
        layout: this.presentPipeline!.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.textureViews.get(inputTexture)! },
          { binding: 1, resource: this.linearSampler! }
        ]
      });
      this.presentBindGroups.set(inputTexture, bindGroup);
    }

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
    if (!this.uniformsDirty) return;

    for (const pass of PASS_SPECS) {
      const data = this.uniformData.get(pass.id)!;
      packUniforms(pass.uniforms, state.uniforms, data);
      this.device!.queue.writeBuffer(this.uniformBuffers!.get(pass.id)!, 0, data);
    }
    this.renderPlan = createRenderPassPlan(
      getEnabledRenderPasses(PASS_SPECS, state.uniforms),
      this.intermediateTextures.length
    );
    this.uniformsDirty = false;
  }

  onUniformsChanged(): void {
    this.uniformsDirty = true;
  }

  private replaceIntermediateTextures(state: PipelineState): void {
    for (const texture of this.intermediateTextures) {
      texture.destroy();
      this.textureViews.delete(texture);
    }
    this.intermediateTextures = [];

    const [targetWidth, targetHeight] = state.uniforms.upscale.outputSize;
    for (let i = 0; i < 2; i++) {
      const texture = this.device!.createTexture({
        label: `Intermediate Texture ${i}`,
        size: [targetWidth, targetHeight],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      const view = texture.createView();
      this.intermediateTextures.push(texture);
      this.textureViews.set(texture, view);
    }
    this.bindGroups.clear();
    this.presentBindGroups.clear();
    this.renderPlan = null;
    this.uniformsDirty = true;
  }

  resize(state: PipelineState): void {
    if (!this.device || !this.context) return;

    this.replaceIntermediateTextures(state);
    this.context.configure({
      device: this.device,
      format: this.canvasFormat!,
      alphaMode: 'opaque'
    });
  }

  async captureFrame(state: PipelineState): Promise<ImageBitmap> {
    return createImageBitmap(state.canvas as ImageBitmapSource);
  }

  releaseResources(): void {
    this.sourceTexture?.destroy();
    this.sourceTexture = null;

    this.intermediateTextures.forEach((texture) => texture.destroy());
    this.intermediateTextures = [];

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
    this.textureViews.clear();
    this.bindGroups.clear();
    this.presentBindGroups.clear();
    this.uniformData.clear();
    this.renderPlan = null;
    this.uniformsDirty = true;
  }
}
