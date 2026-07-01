import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '@/application/catalog';
import { WebGpuDriver } from '@/infrastructure/webgpu.driver';
import { PipelineController } from '@/infrastructure/pipeline-controller';

interface MockGpuTexture {
  label: string;
  view: { label: string };
  createView: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

const CREATE_NATIVE_RENDER_PIPELINE_ASYNC = ['create', 'Render', 'PipelineAsync'].join('');

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
    [CREATE_NATIVE_RENDER_PIPELINE_ASYNC]: vi.fn(async (descriptor) => {
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

describe('WebGpuDriver', () => {
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

  it('renders planned WebGPU passes to intermediates and presents the final texture to the canvas', async () => {
    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });

    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
    };
    const renderer = new PipelineController({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    }, new WebGpuDriver());

    await renderer.initialize();
    renderer.renderFrame({} as TexImageSource);

    expect(runtime.setPipeline.mock.calls.map(([renderPipeline]) => renderPipeline.label)).toEqual([
      'pixel-upscale pipeline',
      'unsharp-mask pipeline',
      'color-elevation pipeline',
      'present pipeline'
    ]);
    expect(runtime.beginRenderPass).toHaveBeenCalledTimes(4);
    expect(runtime.beginRenderPass.mock.calls[3][0].colorAttachments[0].view).toBe(runtime.canvasTexture.view);
    expect(runtime.context.getCurrentTexture).toHaveBeenCalledTimes(1);

    const bindGroups = runtime.createBindGroup.mock.calls.map(([descriptor]) => descriptor);
    // Effect passes bind their input texture at binding 1 (uniform buffer is binding 0).
    expect(bindGroups.slice(0, 3).map((descriptor) => descriptor.entries[1].resource.label)).toEqual([
      'Source Texture view',
      'Intermediate Texture 0 view',
      'Intermediate Texture 1 view'
    ]);
    // The present pass samples the final intermediate at binding 0 and writes to the canvas.
    expect(bindGroups[3].entries[0].resource.label).toBe('Intermediate Texture 0 view');
    expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);
  });

  it('recreates intermediate textures on resize and clears via a dedicated render pass', async () => {
    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });

    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
    };
    const renderer = new PipelineController({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    }, new WebGpuDriver());

    await renderer.initialize();
    const texturesAfterInit = runtime.createTexture.mock.calls.length;
    const configuresAfterInit = runtime.context.configure.mock.calls.length;

    renderer.resize(1280, 1152);

    expect(runtime.createTexture.mock.calls.length).toBe(texturesAfterInit + 2);
    expect(runtime.context.configure.mock.calls.length).toBe(configuresAfterInit + 1);

    runtime.beginRenderPass.mockClear();
    runtime.draw.mockClear();
    runtime.device.queue.submit.mockClear();

    renderer.clearFrame();

    expect(runtime.beginRenderPass).toHaveBeenCalledTimes(1);
    expect(runtime.beginRenderPass.mock.calls[0][0].colorAttachments[0].loadOp).toBe('clear');
    expect(runtime.draw).not.toHaveBeenCalled();
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
    const renderer = new PipelineController({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    }, new WebGpuDriver());

    await renderer.initialize();
    renderer.releaseResources();
    renderer.resume();

    expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
    expect(renderer.isInitialized).toBe(false);
    expect(renderer.isActive).toBe(false);
  });
});
