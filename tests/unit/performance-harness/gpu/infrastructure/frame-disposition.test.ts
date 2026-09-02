import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPackageDefaultPreset, getPreset } from '../../../../../src/platform/gpu/application/catalog';
import { CanvasDriver } from '../../../../../src/platform/gpu/infrastructure/canvas.driver';
import { PipelineController } from '../../../../../src/platform/gpu/infrastructure/pipeline-controller';
import { WebGpuDriver } from '../../../../../src/platform/gpu/infrastructure/webgpu.driver';
import { createMockCanvas } from '@platform/gpu/testkit';

vi.mock('../../../../../src/platform/gpu/infrastructure/shaders', () => ({
  loadWebGpuShaders: () => ({
    byFileName: new Proxy<Record<string, string>>({}, {
      get: () => 'shader source'
    })
  })
}));

const CREATE_NATIVE_RENDER_PIPELINE_ASYNC = ['create', 'Render', 'PipelineAsync'].join('');

function createGpuTexture(label: string) {
  const view = { label: `${label} view` };

  return {
    label,
    createView: vi.fn(() => view),
    destroy: vi.fn()
  };
}

function createWebGpuRuntimeMock(options: { submitFails?: boolean } = {}) {
  const beginRenderPass = vi.fn(() => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn()
  }));
  const device = {
    limits: { maxTextureDimension2D: 8192, maxBindGroups: 8 },
    lost: new Promise(() => undefined),
    queue: {
      copyExternalImageToTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn(() => {
        if (options.submitFails) {
          throw new Error('queue submit failed');
        }
      })
    },
    createShaderModule: vi.fn((descriptor) => ({
      label: descriptor.label,
      code: descriptor.code,
      getCompilationInfo: vi.fn(async () => ({ messages: [] }))
    })),
    [CREATE_NATIVE_RENDER_PIPELINE_ASYNC]: vi.fn(async (descriptor) => ({
      label: descriptor.label,
      getBindGroupLayout: vi.fn(() => ({ label: `${descriptor.label} layout` }))
    })),
    createSampler: vi.fn((descriptor) => ({ label: descriptor.label })),
    createTexture: vi.fn((descriptor) => createGpuTexture(descriptor.label)),
    createBuffer: vi.fn((descriptor) => ({ label: descriptor.label, destroy: vi.fn() })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass,
      finish: vi.fn(() => ({ label: 'command-buffer' }))
    })),
    createBindGroup: vi.fn((descriptor) => ({ label: descriptor.label, entries: descriptor.entries })),
    destroy: vi.fn()
  };
  const context = {
    configure: vi.fn(),
    getCurrentTexture: vi.fn(() => createGpuTexture('Canvas Texture'))
  };

  return {
    context,
    device,
    gpu: {
      requestAdapter: vi.fn(async () => ({
        info: {
          vendor: 'test-vendor', architecture: 'test-architecture', device: 'test-device',
          description: 'test-adapter', isFallbackAdapter: false
        },
        requestDevice: vi.fn(async () => device)
      })),
      getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm')
    }
  };
}

function createWebGpuPipeline(runtime: ReturnType<typeof createWebGpuRuntimeMock>) {
  const canvas = {
    width: 640,
    height: 576,
    getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
  };

  return new PipelineController({
    canvas: canvas as unknown as HTMLCanvasElement,
    nativeWidth: 160,
    nativeHeight: 144,
    preset: getPreset('vibrant')!
  }, new WebGpuDriver());
}

describe('harness frame dispositions', () => {
  beforeEach(() => {
    vi.stubGlobal('__PRISMGB_PERF_HARNESS__', true);
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

  it('propagates Canvas draw and WebGPU queue-submit completion through PipelineController', async () => {
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      imageSmoothingEnabled: true
    };
    const canvas = createMockCanvas(160, 144, { '2d': context });
    const canvasPipeline = new PipelineController({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPackageDefaultPreset()
    }, new CanvasDriver());

    await canvasPipeline.initialize();
    expect(canvasPipeline.renderFrame({} as TexImageSource)).toEqual({
      outcome: 'canvas-draw-completed'
    });
    canvasPipeline.pause();
    expect(canvasPipeline.renderFrame({} as TexImageSource)).toEqual({
      outcome: 'skipped-inactive'
    });

    const runtime = createWebGpuRuntimeMock();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });
    const webGpuPipeline = createWebGpuPipeline(runtime);

    await webGpuPipeline.initialize();
    expect(webGpuPipeline.renderFrame({} as TexImageSource)).toEqual({
      outcome: 'webgpu-queue-submit-completed'
    });
  });

  it('keeps failed and inactive WebGPU dispositions distinct', async () => {
    const runtime = createWebGpuRuntimeMock({ submitFails: true });
    vi.stubGlobal('navigator', { gpu: runtime.gpu });
    const pipeline = createWebGpuPipeline(runtime);

    await pipeline.initialize();

    expect(pipeline.renderFrame({} as TexImageSource)).toEqual({ outcome: 'failed' });
    expect(pipeline.isActive).toBe(false);
    expect(pipeline.renderFrame({} as TexImageSource)).toEqual({ outcome: 'skipped-inactive' });
  });
});
