import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePreset } from '../../../../../src/platform/gpu/domain/presets.definitions';
import { WebGpuDriver, type WebGpuDriverConfig } from '../../../../../src/platform/gpu/infrastructure/webgpu.driver';

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
  let loseDevice: () => void = () => undefined;

  beginRenderPass.mockReturnValue({ setPipeline, setBindGroup, draw, end });

  const device = {
    lost: new Promise<void>((resolve) => {
      loseDevice = resolve;
    }),
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
    createRenderPipelineAsync: vi.fn(async (descriptor) => ({
      label: descriptor.label,
      getBindGroupLayout: vi.fn(() => ({ label: `${descriptor.label} layout` }))
    })),
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
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm')
  };

  return {
    beginRenderPass,
    canvasTexture,
    context,
    createBindGroup,
    createTexture,
    device,
    gpu,
    loseDevice: () => loseDevice(),
    setPipeline
  };
}

type WebGpuRuntimeMock = ReturnType<typeof createWebGpuRuntimeMock>;

function createCanvas(runtime: WebGpuRuntimeMock, context: unknown = runtime.context) {
  return {
    width: 640,
    height: 576,
    getContext: vi.fn((contextType) => contextType === 'webgpu' ? context : null)
  };
}

async function createDriver(runtime: WebGpuRuntimeMock, config: Partial<WebGpuDriverConfig> = {}) {
  vi.stubGlobal('navigator', { gpu: runtime.gpu });
  const canvas = createCanvas(runtime);
  const driver = await WebGpuDriver.create(canvas as unknown as OffscreenCanvas, {
    nativeWidth: 160,
    nativeHeight: 144,
    preset: resolvePreset('vibrant'),
    brightness: 1,
    ...config
  });

  return { canvas, driver };
}

function colorUniformWrites(runtime: WebGpuRuntimeMock): Float32Array[] {
  return runtime.device.queue.writeBuffer.mock.calls
    .filter(([buffer]) => buffer.label === 'color-elevation uniform buffer')
    .map(([, , data]) => data);
}

const frame = {} as ImageBitmap;

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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('configures the canvas context with the preferred format', async () => {
    const runtime = createWebGpuRuntimeMock();
    await createDriver(runtime);

    expect(runtime.context.configure).toHaveBeenCalledWith({
      device: runtime.device,
      format: 'bgra8unorm',
      alphaMode: 'opaque'
    });
    expect(runtime.device.createRenderPipelineAsync.mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({
      label: 'present pipeline',
      fragment: expect.objectContaining({ targets: [{ format: 'bgra8unorm' }] })
    }));
  });

  it('renders enabled WebGPU passes to intermediates and presents the final texture to the canvas', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);

    driver.renderFrame(frame);

    expect(runtime.device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source: frame, flipY: true },
      { texture: expect.objectContaining({ label: 'Source Texture' }) },
      [160, 144]
    );
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
    expect(bindGroups.slice(0, 3).map((descriptor) => descriptor.entries[2].resource.label)).toEqual([
      'Nearest Sampler',
      'Linear Sampler',
      'Linear Sampler'
    ]);
    // The present pass samples the final intermediate at binding 0 and writes to the canvas.
    expect(bindGroups[3].entries[0].resource.label).toBe('Intermediate Texture 0 view');
    expect(runtime.device.queue.submit).toHaveBeenCalledTimes(1);
  });

  it('reuses effect bind groups across frames', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);

    driver.renderFrame(frame);
    driver.renderFrame(frame);

    expect(runtime.createBindGroup.mock.calls.map(([descriptor]) => descriptor.label)).toEqual([
      'Cached pixel-upscale pipeline BindGroup',
      'Cached unsharp-mask pipeline BindGroup',
      'Cached color-elevation pipeline BindGroup',
      'Present BindGroup',
      'Present BindGroup'
    ]);
  });

  it('uploads uniforms on the first frame and again only after a preset, brightness or size change', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);
    const { writeBuffer } = runtime.device.queue;

    driver.renderFrame(frame);
    driver.renderFrame(frame);
    expect(writeBuffer).toHaveBeenCalledTimes(4);

    driver.setPreset(resolvePreset('pixel'));
    driver.renderFrame(frame);
    expect(writeBuffer).toHaveBeenCalledTimes(8);

    driver.setBrightness(0.5);
    driver.renderFrame(frame);
    expect(writeBuffer).toHaveBeenCalledTimes(12);

    driver.resize(1280, 1152);
    driver.renderFrame(frame);
    driver.renderFrame(frame);
    expect(writeBuffer).toHaveBeenCalledTimes(16);
  });

  it('clamps brightness to 0..2 before it scales the preset brightness', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime, { brightness: 3 });

    driver.renderFrame(frame);
    driver.setBrightness(-1);
    driver.renderFrame(frame);

    expect(colorUniformWrites(runtime).map((data) => data[3])).toEqual([
      Math.fround(1.05 * 2),
      0
    ]);
  });

  it('resizes the canvas, recreates intermediate textures and rebuilds bind groups', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { canvas, driver } = await createDriver(runtime);
    driver.renderFrame(frame);
    const texturesAfterInit = runtime.createTexture.mock.calls.length;
    const configuresAfterInit = runtime.context.configure.mock.calls.length;
    const bindGroupsAfterFirstFrame = runtime.createBindGroup.mock.calls.length;

    driver.resize(1280, 1152);
    driver.renderFrame(frame);

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(1152);
    expect(runtime.createTexture.mock.calls.slice(texturesAfterInit).map(([descriptor]) => descriptor)).toEqual([
      expect.objectContaining({ label: 'Intermediate Texture 0', size: [1280, 1152] }),
      expect.objectContaining({ label: 'Intermediate Texture 1', size: [1280, 1152] })
    ]);
    expect(runtime.context.configure.mock.calls.length).toBe(configuresAfterInit + 1);
    expect(runtime.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirstFrame + 4);
  });

  it('stops rendering after the device is lost', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);

    runtime.loseDevice();
    await Promise.resolve();
    driver.renderFrame(frame);

    expect(runtime.device.queue.submit).not.toHaveBeenCalled();
  });

  it('stops rendering after a frame fails', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);
    runtime.device.queue.copyExternalImageToTexture.mockImplementationOnce(() => {
      throw new Error('copy failed');
    });

    driver.renderFrame(frame);
    driver.renderFrame(frame);

    expect(runtime.device.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    expect(runtime.device.queue.submit).not.toHaveBeenCalled();
  });

  it('rejects when WebGPU is unavailable', async () => {
    const runtime = createWebGpuRuntimeMock();
    const canvas = createCanvas(runtime) as unknown as OffscreenCanvas;
    const config = { nativeWidth: 160, nativeHeight: 144, preset: resolvePreset('vibrant'), brightness: 1 };

    vi.stubGlobal('navigator', {});
    await expect(WebGpuDriver.create(canvas, config)).rejects.toThrow('WebGPU not supported');

    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn(async () => null) } });
    await expect(WebGpuDriver.create(canvas, config)).rejects.toThrow('WebGPU adapter not available');
  });

  it('rejects and destroys the device when the canvas has no WebGPU context', async () => {
    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });
    const canvas = createCanvas(runtime, null) as unknown as OffscreenCanvas;

    await expect(WebGpuDriver.create(canvas, {
      nativeWidth: 160,
      nativeHeight: 144,
      preset: resolvePreset('vibrant'),
      brightness: 1
    })).rejects.toThrow('WebGPU context not available');
    expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
  });

  it('dispose destroys the device once and stops rendering', async () => {
    const runtime = createWebGpuRuntimeMock();
    const { driver } = await createDriver(runtime);

    driver.dispose();
    driver.dispose();
    driver.renderFrame(frame);

    expect(runtime.device.destroy).toHaveBeenCalledTimes(1);
    expect(runtime.device.queue.submit).not.toHaveBeenCalled();
  });
});
