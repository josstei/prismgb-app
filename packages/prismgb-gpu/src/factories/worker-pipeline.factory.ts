import type { IPipeline, IPipelineCapabilities, IPipelineStats, RenderCanvas, RenderAPI, WebGL2Info } from '../domain/pipeline';
import type { IPreset as IPresetAlias } from '../domain/presets';
import { createPipeline } from './pipeline.factory';

export interface CreateWorkerPipelineOptions {
  canvas: RenderCanvas;
  api?: RenderAPI;
  nativeSize: readonly [number, number];
  outputSize: readonly [number, number];
  preset?: IPresetAlias;
}

export interface WorkerPipeline {
  render: (source: TexImageSource) => void;
  resize: (width: number, height: number) => void;
  captureFrame: () => Promise<ImageBitmap>;
  getStats: () => IPipelineStats;
  dispose: () => Promise<void>;
  setPreset: (preset: IPresetAlias) => void;
  setBrightness: (value: number) => void;
}

function detectCanvasWebGL2(canvas: RenderCanvas): { supported: boolean; info?: WebGL2Info } {
  try {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      return { supported: false };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      supported: true,
      info: {
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'worker-canvas',
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'worker-canvas',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
      }
    };
  } catch {
    return { supported: false };
  }
}

function isOffscreenCanvas(canvas: RenderCanvas): boolean {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

function createWorkerCapabilities(canvas: RenderCanvas, preferredAPI?: RenderAPI): IPipelineCapabilities {
  const webgl2Result = preferredAPI !== 'canvas2d'
    ? detectCanvasWebGL2(canvas)
    : { supported: false };
  const webgpuSupported = preferredAPI === 'webgpu' && typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  const resolvedPreferredAPI = preferredAPI
    ?? (webgpuSupported ? 'webgpu' : webgl2Result.supported ? 'webgl2' : 'canvas2d');

  return {
    webgpu: webgpuSupported,
    webgl2: webgl2Result.supported,
    offscreenCanvas: isOffscreenCanvas(canvas),
    transferControlToOffscreen: false,
    preferredAPI: resolvedPreferredAPI,
    maxTextureSize: webgl2Result.info?.maxTextureSize ?? 4096,
    webgl2Info: webgl2Result.info
  };
}

export async function createWorkerPipeline(options: CreateWorkerPipelineOptions): Promise<WorkerPipeline> {
  const [nativeWidth, nativeHeight] = options.nativeSize;
  const [outputWidth, outputHeight] = options.outputSize;

  options.canvas.width = outputWidth;
  options.canvas.height = outputHeight;

  const pipeline = await createPipeline({
    canvas: options.canvas,
    nativeWidth,
    nativeHeight,
    preferredAPI: options.api,
    capabilities: createWorkerCapabilities(options.canvas, options.api),
    preset: options.preset
  }) as IPipeline;

  return {
    render: (source: TexImageSource): void => {
      pipeline.renderFrame(source);
    },
    resize: (width: number, height: number): void => {
      pipeline.resize(width, height);
    },
    captureFrame: async (): Promise<ImageBitmap> => {
      return pipeline.captureFrame();
    },
    getStats: (): IPipelineStats => {
      return pipeline.getStats();
    },
    dispose: async (): Promise<void> => {
      await pipeline.dispose();
    },
    setPreset: (preset: IPresetAlias): void => {
      pipeline.setPreset(preset);
    },
    setBrightness: (value: number): void => {
      pipeline.setBrightness(value);
    }
  };
}
