import { BasePipeline } from '../pipeline-base';
import { RecoverableBackendInitializationError } from '../../domain/errors';
import { getEnabledRenderPasses } from '../../application/render-pass-enablement';
import { createRenderPassPlan, type RenderPlanSource, type RenderPlanTarget } from '../../application/render-plan';
import {
  WEBGPU_RENDER_PASSES,
  type WebGPURenderPass
} from '../webgpu.uniforms';
import { loadWebGPUShaders } from '../shader-sources';
import { BindGroupCache, UniformTracker } from './webgpu.resources';

type RenderPipelines = Map<string, GPURenderPipeline>;
type UniformBuffers = Map<string, GPUBuffer>;

/**
 * WebGPU manifest-driven rendering pipeline.
 *
 * Renders Game Boy frames through the render-pass contract and uses ping-pong
 * intermediate textures, bind group caching, and uniform change tracking for
 * optimized per-frame overhead.
 */
export class WebGPUPipeline extends BasePipeline {
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

  private bindGroupCache = new BindGroupCache();
  private uniformTracker = new UniformTracker();

  private hasError = false;

  async initialize(): Promise<void> {
    if (this._isInitialized) return;

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
        this._isActive = false;
      }
    });

    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
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
    this.createResources();

    this._isInitialized = true;
    this._isActive = true;
  }

  private async createPipelines(): Promise<void> {
    const device = this.device!;
    const shaders = loadWebGPUShaders();

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
      const shaderSource = shaders.byFileName[pass.webgpu.shaderFile];
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

      pipelines.set(pass.passId, await device.createRenderPipelineAsync(descriptor));
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

  private createResources(): void {
    const device = this.device!;
    const [targetWidth, targetHeight] = this.uniforms.upscale.outputSize;

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
        size: pass.webgpu.layout.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      }));
    }

    this.uniformBuffers = uniformBuffers;
  }

  renderFrame(source: TexImageSource): void {
    if (!this._isActive || !this.device || !this.context || this.hasError) return;
    if (!this.renderPipelines || !this.uniformBuffers || !this.sourceTexture) return;

    const startTime = performance.now();

    try {
      this.device.queue.copyExternalImageToTexture(
        { source: source as ImageBitmap, flipY: true },
        { texture: this.sourceTexture },
        [this.nativeWidth, this.nativeHeight]
      );

      this.uploadUniforms();

      const commandEncoder = this.device.createCommandEncoder();
      const plan = createRenderPassPlan(
        getEnabledRenderPasses(WEBGPU_RENDER_PASSES, this.uniforms, this.preset),
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
      this.updateStats(performance.now() - startTime);
    } catch {
      this.hasError = true;
      this._isActive = false;
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

  private getPassSampler(pass: WebGPURenderPass): GPUSampler {
    return pass.sampler === 'nearest' ? this.nearestSampler! : this.linearSampler!;
  }

  private getCanvasOutputPass(): WebGPURenderPass {
    const pass = WEBGPU_RENDER_PASSES.find((candidate) => candidate.outputsToCanvas);
    if (!pass) {
      throw new Error('No render pass is configured to output to canvas');
    }

    return pass;
  }

  private renderPass(
    commandEncoder: GPUCommandEncoder,
    pass: WebGPURenderPass,
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

  private uploadUniforms(): void {
    const device = this.device!;
    for (const pass of WEBGPU_RENDER_PASSES) {
      const uniformData = pass.webgpu.uniformData(this.uniforms);
      const buffer = this.uniformBuffers!.get(pass.passId);
      if (!buffer) {
        throw new Error(`Missing uniform buffer for pass '${pass.passId}'`);
      }

      if (this.uniformTracker.hasChanged(pass.passId, uniformData)) {
        device.queue.writeBuffer(buffer, 0, uniformData as unknown as ArrayBuffer);
      }
    }
  }

  protected onUniformsChanged(): void {
    this.uniformTracker.invalidateAll();
  }

  protected onResize(): void {
    if (!this.device || !this.context) return;

    this.intermediateTextures.forEach((texture) => texture.destroy());
    this.intermediateTextures = [];
    this.intermediateTextureViews = [];

    const [targetWidth, targetHeight] = this.uniforms.upscale.outputSize;
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

    this.bindGroupCache.invalidate();
    this.uniformTracker.invalidateAll();
  }

  async captureFrame(): Promise<ImageBitmap> {
    return createImageBitmap(this.canvas as ImageBitmapSource);
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
    this.bindGroupCache.invalidate();
    this._isActive = false;
    this._isInitialized = false;
  }

  async dispose(): Promise<void> {
    this.releaseResources();
  }
}
