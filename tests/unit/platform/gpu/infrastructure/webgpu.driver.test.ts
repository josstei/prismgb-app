import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '../../../../../src/platform/gpu/application/catalog';
import { WebGpuDriver } from '../../../../../src/platform/gpu/infrastructure/webgpu.driver';
import { PipelineController } from '../../../../../src/platform/gpu/infrastructure/pipeline-controller';
import * as passes from '../../../../../src/platform/gpu/application/passes';

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

async function createRenderer(runtime: ReturnType<typeof createWebGpuRuntimeMock>): Promise<PipelineController> {
  vi.stubGlobal('navigator', { gpu: runtime.gpu });
  const renderer = new PipelineController({
    canvas: { width: 640, height: 576, getContext: () => runtime.context },
    nativeWidth: 160,
    nativeHeight: 144,
    preset: getPreset('vibrant')!
  }, new WebGpuDriver());
  await renderer.initialize();
  return renderer;
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
    vi.restoreAllMocks();
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

  it('reuses uniform storage, pass plans, bind groups and sampled views across unchanged frames', async () => {
    const plan = vi.spyOn(passes, 'createRenderPassPlan');
    const runtime = createWebGpuRuntimeMock();
    const renderer = await createRenderer(runtime);
    for (let i = 0; i < 10; i++) renderer.renderFrame({} as TexImageSource);

    expect(runtime.device.queue.writeBuffer).toHaveBeenCalledTimes(4);
    expect(plan).toHaveBeenCalledTimes(1);
    expect(runtime.createBindGroup).toHaveBeenCalledTimes(4);
    for (const result of runtime.createTexture.mock.results) {
      expect(result.value.createView).toHaveBeenCalledTimes(1);
    }
    // Presentation targets belong to the swapchain and must be reacquired every frame.
    expect(runtime.context.getCurrentTexture).toHaveBeenCalledTimes(10);
    expect(runtime.canvasTexture.createView).toHaveBeenCalledTimes(10);
    expect(runtime.device.queue.submit).toHaveBeenCalledTimes(10);
    await renderer.dispose();
  });

  it('updates uniforms and pass selection only after preset or brightness changes', async () => {
    const plan = vi.spyOn(passes, 'createRenderPassPlan');
    const runtime = createWebGpuRuntimeMock();
    const renderer = await createRenderer(runtime);
    renderer.renderFrame({} as TexImageSource);
    const initialStorage = runtime.device.queue.writeBuffer.mock.calls.map((call) => call[2]);

    renderer.setBrightness(1.25);
    renderer.renderFrame({} as TexImageSource);
    expect(runtime.device.queue.writeBuffer).toHaveBeenCalledTimes(8);
    for (const [index, call] of runtime.device.queue.writeBuffer.mock.calls.slice(4).entries()) {
      expect(call[2]).toBe(initialStorage[index]);
    }
    expect(runtime.createBindGroup).toHaveBeenCalledTimes(4);
    expect(plan).toHaveBeenCalledTimes(2);

    renderer.setPreset(getPreset('performance')!);
    runtime.setPipeline.mockClear();
    renderer.renderFrame({} as TexImageSource);
    expect(runtime.setPipeline.mock.calls.map(([pipeline]) => pipeline.label)).toEqual([
      'pixel-upscale pipeline', 'present pipeline'
    ]);
    expect(runtime.device.queue.writeBuffer).toHaveBeenCalledTimes(12);
    expect(plan).toHaveBeenCalledTimes(3);
    renderer.renderFrame({} as TexImageSource);
    expect(plan).toHaveBeenCalledTimes(3);
    await renderer.dispose();
  });

  it('destroys old intermediates and invalidates plans and bind groups on resize', async () => {
    const plan = vi.spyOn(passes, 'createRenderPassPlan');
    const runtime = createWebGpuRuntimeMock();
    const renderer = await createRenderer(runtime);
    renderer.renderFrame({} as TexImageSource);
    const oldTextures = runtime.createTexture.mock.results.map((result) => result.value);
    const oldGroups = runtime.createBindGroup.mock.results.map((result) => result.value);

    renderer.resize(1280, 1152);
    expect(oldTextures[0].destroy).not.toHaveBeenCalled();
    expect(oldTextures[1].destroy).toHaveBeenCalledTimes(1);
    expect(oldTextures[2].destroy).toHaveBeenCalledTimes(1);
    expect(runtime.createTexture).toHaveBeenCalledTimes(5);
    expect(runtime.createTexture.mock.calls.slice(3).map(([descriptor]) => descriptor.size)).toEqual([
      [1280, 1152], [1280, 1152]
    ]);
    runtime.setBindGroup.mockClear();
    renderer.renderFrame({} as TexImageSource);
    expect(runtime.device.queue.writeBuffer).toHaveBeenCalledTimes(8);
    expect(plan).toHaveBeenCalledTimes(2);
    expect(runtime.createBindGroup).toHaveBeenCalledTimes(8);
    for (const [, group] of runtime.setBindGroup.mock.calls) expect(oldGroups).not.toContain(group);
    expect(runtime.context.configure).toHaveBeenCalledTimes(2);
    await renderer.dispose();
  });

  it('disposes resources once and stops rendering', async () => {
    const runtime = createWebGpuRuntimeMock();
    const renderer = await createRenderer(runtime);
    await renderer.dispose();
    await renderer.dispose();
    renderer.renderFrame({} as TexImageSource);

    expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
    expect(runtime.device.queue.submit).not.toHaveBeenCalled();
    expect(renderer.isInitialized).toBe(false);
    expect(renderer.isActive).toBe(false);
  });
});
