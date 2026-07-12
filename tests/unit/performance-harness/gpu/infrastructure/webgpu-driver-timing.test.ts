import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreset } from '../../../../../src/platform/gpu/application/catalog';
import { WEBGPU_RENDER_PASSES, WebGpuDriver } from '../../../../../src/platform/gpu/infrastructure/webgpu.driver';
import { PipelineController } from '../../../../../src/platform/gpu/infrastructure/pipeline-controller';

vi.mock('../../../../../src/platform/gpu/infrastructure/shaders', () => ({
  loadWebGpuShaders: () => ({
    byFileName: new Proxy<Record<string, string>>({}, {
      get: () => 'shader source'
    })
  })
}));

const CREATE_NATIVE_RENDER_PIPELINE_ASYNC = ['create', 'Render', 'PipelineAsync'].join('');

function createTexture(label: string) {
  return {
    label,
    createView: vi.fn(() => ({ label: `${label} view` })),
    destroy: vi.fn()
  };
}

function createRuntime() {
  const beginRenderPass = vi.fn(() => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    draw: vi.fn(),
    end: vi.fn()
  }));
  const device = {
    lost: new Promise(() => undefined),
    queue: {
      copyExternalImageToTexture: vi.fn(),
      writeBuffer: vi.fn(),
      submit: vi.fn()
    },
    createShaderModule: vi.fn((descriptor) => ({
      label: descriptor.label,
      getCompilationInfo: vi.fn(async () => ({ messages: [] }))
    })),
    [CREATE_NATIVE_RENDER_PIPELINE_ASYNC]: vi.fn(async (descriptor) => ({
      label: descriptor.label,
      getBindGroupLayout: vi.fn(() => ({ label: `${descriptor.label} layout` }))
    })),
    createSampler: vi.fn((descriptor) => ({ label: descriptor.label })),
    createTexture: vi.fn((descriptor) => createTexture(descriptor.label)),
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
    getCurrentTexture: vi.fn(() => createTexture('Canvas Texture'))
  };
  return {
    context,
    device,
    gpu: {
      requestAdapter: vi.fn(async () => ({ requestDevice: vi.fn(async () => device) })),
      getPreferredCanvasFormat: vi.fn(() => 'rgba8unorm')
    }
  };
}

describe('instrumented WebGpuDriver frame instrumentation', () => {
  beforeEach(() => {
    let now = 0;
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
      now: vi.fn(() => now++)
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports the CPU queue-submit span and real request invocations', async () => {
    const runtime = createRuntime();
    vi.stubGlobal('navigator', { gpu: runtime.gpu });
    const renderer = new PipelineController({
      canvas: {
        width: 640,
        height: 576,
        getContext: vi.fn((contextType) => contextType === 'webgpu' ? runtime.context : null)
      } as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: getPreset('vibrant')!
    }, new WebGpuDriver());
    const expectedUniformByteLength = WEBGPU_RENDER_PASSES.reduce(
      (total, pass) => total + pass.backend.layout.byteLength,
      0
    );
    const instrumentationObserver = {
      recordWebGpuQueueSubmitTiming: vi.fn(),
      recordWebGpuFrameRequestProxy: vi.fn()
    };

    await renderer.initialize();
    expect(renderer.renderFrame({} as TexImageSource, instrumentationObserver)).toEqual({
      outcome: 'webgpu-queue-submit-completed'
    });

    expect(runtime.device.queue.submit).toHaveBeenCalledOnce();
    expect(instrumentationObserver.recordWebGpuQueueSubmitTiming).toHaveBeenCalledOnce();
    const [startedAt, endedAt] = instrumentationObserver.recordWebGpuQueueSubmitTiming.mock.calls[0];
    expect(startedAt).toBeLessThanOrEqual(endedAt);
    expect(instrumentationObserver.recordWebGpuFrameRequestProxy).toHaveBeenNthCalledWith(1, {
      operationId: 'uniform-float32-array',
      sourceLocationId: 'webgpu-driver:uniform-float32-array',
      outcome: 'success',
      byteKind: 'requested-byte-length',
      byteValue: expectedUniformByteLength,
      requestedByteLength: expectedUniformByteLength
    });
    expect(instrumentationObserver.recordWebGpuFrameRequestProxy).toHaveBeenNthCalledWith(2, {
      operationId: 'render-pass-plan-materialization',
      sourceLocationId: 'webgpu-driver:materialize-render-plan',
      outcome: 'success',
      byteKind: 'count-only-unavailable',
      byteValue: null
    });
    expect(instrumentationObserver.recordWebGpuFrameRequestProxy).toHaveBeenNthCalledWith(3, {
      operationId: 'bind-group-create',
      sourceLocationId: 'webgpu-driver:create-bind-group',
      outcome: 'success',
      byteKind: 'count-only-unavailable',
      byteValue: null
    });
  });
});
