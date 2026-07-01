import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '@/application/preset-catalog';
import { WebGPUPipeline } from '@/infrastructure/webgpu/webgpu-pipeline';

interface MockGpuTexture {
  label: string;
  view: { label: string };
  createView: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

function createGpuTexture(label: string): MockGpuTexture {
  const view = { label: `${label} view` };

  return {
    label,
    view,
    createView: vi.fn(() => view),
    destroy: vi.fn()
  };
}

function createWebGpuRuntimeMock() {
  const beginRenderPass = vi.fn();
  const setPipeline = vi.fn();
  const setBindGroup = vi.fn();
  const draw = vi.fn();
  const end = vi.fn();
  const finish = vi.fn(() => ({ label: 'command-buffer' }));
  const createBindGroup = vi.fn((descriptor) => ({ label: descriptor.label, entries: descriptor.entries }));
  const createTexture = vi.fn((descriptor) => createGpuTexture(descriptor.label));
  const canvasTexture = createGpuTexture('Canvas Texture');
  const renderPipelines: Array<{ label: string; getBindGroupLayout: ReturnType<typeof vi.fn> }> = [];

  beginRenderPass.mockReturnValue({ setPipeline, setBindGroup, draw, end });

  const device = {
    lost: new Promise(() => undefined),
    queue: {
      copyExternalImageToTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn()
    },
    createShaderModule: vi.fn((descriptor) => ({
      label: descriptor.label,
      code: descriptor.code,
      getCompilationInfo: vi.fn(async () => ({ messages: [] }))
    })),
    createRenderPipelineAsync: vi.fn(async (descriptor) => {
      const pipeline = {
        label: descriptor.label,
        getBindGroupLayout: vi.fn(() => ({ label: `${descriptor.label} layout` }))
      };
      renderPipelines.push(pipeline);
      return pipeline;
    }),
    createSampler: vi.fn((descriptor) => ({ label: descriptor.label })),
    createTexture,
    createBuffer: vi.fn((descriptor) => ({ label: descriptor.label, destroy: vi.fn() })),
    createCommandEncoder: vi.fn(() => ({ beginRenderPass, finish })),
    createBindGroup,
    destroy: vi.fn()
  };
  const context = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => canvasTexture)
  };
  const gpu = {
    requestAdapter: vi.fn(async () => ({ requestDevice: vi.fn(async () => device) })),
    getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm')
  };

  return {
    beginRenderPass,
    canvasTexture,
    context,
    createBindGroup,
    createTexture,
    device,
    draw,
    end,
    finish,
    gpu,
    renderPipelines,
    setBindGroup,
    setPipeline
  };
}

describe('WebGPUPipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('GPUTextureUsage', {
      TEXTURE_BINDING: 1,
      COPY_DST: 2,
      RENDER_ATTACHMENT: 4
    });
    vi.stubGlobal('GPUBufferUsage', {
      UNIFORM: 1,
      COPY_DST: 2
    });
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders planned WebGPU passes and copies non-canvas final output to the canvas', async () => {
    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });

    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
    };
    const pipeline = new WebGPUPipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    });

    await pipeline.initialize();
    pipeline.renderFrame({} as TexImageSource);

    expect(runtime.setPipeline.mock.calls.map(([renderPipeline]) => renderPipeline.label)).toEqual([
      'pixel-upscale pipeline',
      'unsharp-mask pipeline',
      'color-elevation pipeline',
      'crt-lcd pipeline'
    ]);
    expect(runtime.beginRenderPass).toHaveBeenCalledTimes(4);
    expect(runtime.beginRenderPass.mock.calls[3][0].colorAttachments[0].view).toBe(runtime.canvasTexture.view);
    expect(runtime.context.getCurrentTexture).toHaveBeenCalledTimes(1);
    expect(runtime.createBindGroup.mock.calls.map(([descriptor]) => descriptor.entries[1].resource.label)).toEqual([
      'Source Texture view',
      'Intermediate Texture 0 view',
      'Intermediate Texture 1 view',
      'Intermediate Texture 0 view'
    ]);
    expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);
  });

  it('does not resume after public resource release destroys GPU resources', async () => {
    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });

    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
    };
    const pipeline = new WebGPUPipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    });

    await pipeline.initialize();
    pipeline.releaseResources();
    pipeline.resume();

    expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
    expect(pipeline.isInitialized).toBe(false);
    expect(pipeline.isActive).toBe(false);
  });
});
