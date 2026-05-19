import { beforeEach, describe, expect, it, vi, expectTypeOf } from 'vitest';
import type { IPipeline, IPipelineStats } from '@/domain/pipeline';
import { PresetRegistry, BUILT_IN_PRESETS } from '@/domain/presets';
import { RenderCanvas } from '@/domain/pipeline';
import { createWorkerPipeline, type CreateWorkerPipelineOptions } from '@/factories/worker-pipeline.factory';
import * as pipelineFactory from '@/factories/pipeline.factory';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

function createCanvasMock(): RenderCanvas & { width: number; height: number } {
  return {
    width: 160,
    height: 144,
    getContext: vi.fn(() => null),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    captureStream: vi.fn()
  } as unknown as RenderCanvas;
}

function createWebGL2ContextMock(): WebGL2RenderingContext & { loseContextMock: ReturnType<typeof vi.fn> } {
  const activeUniforms = 0x8B86;
  const linkStatus = 0x8B82;
  const compileStatus = 0x8B81;
  const maxTextureSize = 0x0D33;
  const loseContextMock = vi.fn();

  return {
    ACTIVE_UNIFORMS: activeUniforms,
    LINK_STATUS: linkStatus,
    COMPILE_STATUS: compileStatus,
    MAX_TEXTURE_SIZE: maxTextureSize,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    TEXTURE_2D: 0x0DE1,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8D40,
    COLOR_ATTACHMENT0: 0x8CE0,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn((_shader, parameter) => parameter === compileStatus),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program, parameter) => parameter === activeUniforms ? 0 : parameter === linkStatus),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    getActiveUniform: vi.fn(() => null),
    getUniformLocation: vi.fn(() => null),
    createVertexArray: vi.fn(() => ({})),
    deleteVertexArray: vi.fn(),
    createTexture: vi.fn(() => ({})),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    createFramebuffer: vi.fn(() => ({})),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    deleteFramebuffer: vi.fn(),
    getParameter: vi.fn((parameter) => parameter === maxTextureSize ? 8192 : 'mock'),
    getExtension: vi.fn((name) => name === 'WEBGL_lose_context' ? { loseContext: loseContextMock } : null),
    loseContextMock
  } as unknown as WebGL2RenderingContext & { loseContextMock: ReturnType<typeof vi.fn> };
}

describe('createWorkerPipeline', () => {
  const mockStats: IPipelineStats = {
    fps: 60,
    frameTime: 16.7,
    framesRendered: 0,
    framesDropped: 0
  };

  const mockPipeline: IPipeline = {
    isInitialized: true,
    isActive: true,
    initialize: vi.fn(),
    renderFrame: vi.fn(),
    resize: vi.fn(),
    setPreset: vi.fn(),
    getPreset: vi.fn(),
    setBrightness: vi.fn(),
    captureFrame: vi.fn(async () => ({} as ImageBitmap)),
    pause: vi.fn(),
    resume: vi.fn(),
    getStats: vi.fn(() => mockStats),
    releaseResources: vi.fn(),
    dispose: vi.fn(async () => undefined)
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('builds worker-safe API with required methods', async () => {
    const createPipelineSpy = vi
      .spyOn(pipelineFactory, 'createPipeline')
      .mockResolvedValue(mockPipeline);

    const canvas = createCanvasMock();
    const options = {
      canvas,
      nativeSize: [160, 144] as const,
      outputSize: [320, 288] as const,
      api: 'webgl2' as const,
      preset: BUILT_IN_PRESETS[0].preset
    };

    const workerPipeline = await createWorkerPipeline(options);

    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(288);
    expect(workerPipeline).toHaveProperty('render');
    expect(workerPipeline).toHaveProperty('resize');
    expect(workerPipeline).toHaveProperty('captureFrame');
    expect(workerPipeline).toHaveProperty('getStats');
    expect(workerPipeline).toHaveProperty('dispose');

    const source = {} as TexImageSource;
    workerPipeline.render(source);
    workerPipeline.resize(640, 360);
    await workerPipeline.captureFrame();
    workerPipeline.getStats();
    await workerPipeline.dispose();

    expect(createPipelineSpy).toHaveBeenCalledOnce();
    expect(mockPipeline.renderFrame).toHaveBeenCalledWith(source);
    expect(mockPipeline.resize).toHaveBeenCalledWith(640, 360);
    expect(mockPipeline.captureFrame).toHaveBeenCalledTimes(1);
    expect(mockPipeline.getStats).toHaveBeenCalledTimes(1);
    expect(mockPipeline.dispose).toHaveBeenCalledTimes(1);
  });

  it('accepts OffscreenCanvas in compile-time options', () => {
    expectTypeOf<CreateWorkerPipelineOptions['canvas']>().toMatchTypeOf<HTMLCanvasElement | OffscreenCanvas>();

    const offscreenCanvas = {
      width: 128,
      height: 128,
      getContext: vi.fn()
    } as unknown as OffscreenCanvas;

    const options: CreateWorkerPipelineOptions = {
      canvas: offscreenCanvas,
      nativeSize: [160, 144],
      outputSize: [320, 288]
    };

    expect(options.canvas).toBe(offscreenCanvas);
    expect(options.nativeSize).toEqual([160, 144]);
    expect(options.outputSize).toEqual([320, 288]);
  });

  it('selects WebGL2 from the worker canvas without document-based detection', async () => {
    const gl = createWebGL2ContextMock();
    const getContext = vi.fn((contextType: string) => contextType === 'webgl2' ? gl : null);
    const canvas = {
      width: 160,
      height: 144,
      getContext
    } as unknown as RenderCanvas & { width: number; height: number };

    const workerPipeline = await createWorkerPipeline({
      canvas,
      nativeSize: [160, 144],
      outputSize: [320, 288],
      api: 'webgl2',
      preset: BUILT_IN_PRESETS[0].preset
    });

    expect(getContext.mock.calls.map(([contextType]) => contextType)).toContain('webgl2');
    expect(getContext.mock.calls.map(([contextType]) => contextType)).not.toContain('2d');
    expect(gl.loseContextMock).not.toHaveBeenCalled();
    expect(gl.createProgram).toHaveBeenCalled();
    expect(workerPipeline.getStats()).toEqual({
      fps: 0,
      frameTime: 0,
      framesRendered: 0,
      framesDropped: 0
    });

    await workerPipeline.dispose();
  });

  it('does not probe WebGL2 on the render canvas before WebGPU initialization', async () => {
    const createPipelineSpy = vi
      .spyOn(pipelineFactory, 'createPipeline')
      .mockResolvedValue(mockPipeline);
    const originalGpu = navigator.gpu;

    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: {}
    });

    const getContext = vi.fn((contextType: string) => {
      if (contextType === 'webgl2') {
        throw new Error('render canvas must not be used for WebGL2 probing');
      }
      return null;
    });
    const canvas = {
      width: 160,
      height: 144,
      getContext
    } as unknown as RenderCanvas & { width: number; height: number };

    try {
      await createWorkerPipeline({
        canvas,
        nativeSize: [160, 144],
        outputSize: [320, 288],
        api: 'webgpu',
        preset: BUILT_IN_PRESETS[0].preset
      });
    } finally {
      Object.defineProperty(navigator, 'gpu', {
        configurable: true,
        value: originalGpu
      });
    }

    expect(getContext).not.toHaveBeenCalledWith('webgl2', expect.anything());
    expect(createPipelineSpy).toHaveBeenCalledWith(expect.objectContaining({
      canvas,
      preferredAPI: 'webgpu',
      capabilities: expect.objectContaining({
        webgpu: true,
        preferredAPI: 'webgpu'
      })
    }));
  });
});
