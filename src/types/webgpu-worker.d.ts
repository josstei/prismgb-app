interface GPUDevice {
  readonly lost: Promise<GPUDeviceLostInfo>;
  onuncapturederror: ((event: GPUUncapturedErrorEvent) => void) | null;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createSampler(descriptor: GPUSamplerDescriptor): GPUSampler;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createRenderPipelineAsync(descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline>;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(): GPUCommandEncoder;
  readonly queue: GPUQueue;
  destroy(): void;
}

interface GPUDeviceLostInfo {
  readonly reason: string;
  readonly message: string;
}

interface GPUUncapturedErrorEvent {
  readonly error: { readonly message: string };
}

interface GPUShaderModuleDescriptor {
  label?: string;
  code: string;
}

interface GPUShaderModule {
  getCompilationInfo(): Promise<GPUCompilationInfo>;
}

interface GPUCompilationInfo {
  readonly messages: ReadonlyArray<GPUCompilationMessage>;
}

interface GPUCompilationMessage {
  readonly type: string;
  readonly message: string;
  readonly lineNum: number;
}

interface GPUSamplerDescriptor {
  label?: string;
  magFilter?: string;
  minFilter?: string;
  addressModeU?: string;
  addressModeV?: string;
}

interface GPUSampler {}

interface GPUTextureDescriptor {
  label?: string;
  size: number[];
  format: string;
  usage: number;
}

interface GPUTexture {
  createView(): GPUTextureView;
  destroy(): void;
}

interface GPUTextureView {}

interface GPUBufferDescriptor {
  label?: string;
  size: number;
  usage: number;
}

interface GPUBuffer {
  destroy(): void;
}

interface GPURenderPipelineDescriptor {
  label?: string;
  layout: string | GPUPipelineLayout;
  vertex: {
    module: GPUShaderModule;
    entryPoint: string;
  };
  fragment?: {
    module: GPUShaderModule;
    entryPoint: string;
    targets: Array<{ format: string }>;
  };
  primitive?: {
    topology?: string;
    stripIndexFormat?: undefined;
  };
}

interface GPUPipelineLayout {}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUBindGroupLayout {}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: Array<{
    binding: number;
    resource: GPUTextureView | GPUSampler | { buffer: GPUBuffer };
  }>;
}

interface GPUBindGroup {}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPURenderPassDescriptor {
  colorAttachments: Array<{
    view: GPUTextureView;
    loadOp: string;
    storeOp: string;
    clearValue: { r: number; g: number; b: number; a: number };
  }>;
}

interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(vertexCount: number): void;
  end(): void;
}

interface GPUCommandBuffer {}

interface GPUQueue {
  copyExternalImageToTexture(
    source: { source: ImageBitmap; flipY?: boolean },
    destination: { texture: GPUTexture },
    copySize: number[]
  ): void;
  writeBuffer(buffer: GPUBuffer, offset: number, data: Float32Array): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

interface GPUCanvasContext {
  configure(configuration: {
    device: GPUDevice;
    format: string;
    alphaMode?: string;
  }): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUAdapter {
  readonly info: GPUAdapterInfo | null;
  requestDevice(): Promise<GPUDevice>;
}

interface GPUAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
}

interface GPU {
  requestAdapter(options?: { powerPreference?: string }): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): string;
}

interface GPUTextureUsageFlags {
  readonly TEXTURE_BINDING: number;
  readonly COPY_DST: number;
  readonly RENDER_ATTACHMENT: number;
}

interface GPUBufferUsageFlags {
  readonly UNIFORM: number;
  readonly COPY_DST: number;
}

declare const GPUTextureUsage: GPUTextureUsageFlags;
declare const GPUBufferUsage: GPUBufferUsageFlags;

interface OffscreenCanvas {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}
