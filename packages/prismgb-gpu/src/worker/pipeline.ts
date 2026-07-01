import type { RenderCanvas, RenderPipeline, RenderPreset, RenderStats } from '../domain/types';
import { createRenderPipeline } from '../application/render-pipeline';
import { detectWorkerGpuCapabilities } from '../infrastructure/capabilities.worker';
import { isWorkerRenderBackend, type WorkerRenderBackend } from './protocol';

export interface CreateWorkerPipelineOptions {
  canvas: RenderCanvas;
  backend?: WorkerRenderBackend;
  nativeSize: readonly [number, number];
  outputSize: readonly [number, number];
  preset?: RenderPreset;
}

export interface WorkerPipeline {
  backend: WorkerRenderBackend;
  render: (source: TexImageSource) => void;
  resize: (width: number, height: number) => void;
  captureFrame: () => Promise<ImageBitmap>;
  getStats: () => RenderStats;
  dispose: () => Promise<void>;
  setPreset: (preset: RenderPreset) => void;
  setBrightness: (value: number) => void;
}

export async function createWorkerPipeline(options: CreateWorkerPipelineOptions): Promise<WorkerPipeline> {
  const [nativeWidth, nativeHeight] = options.nativeSize;
  const [outputWidth, outputHeight] = options.outputSize;

  options.canvas.width = outputWidth;
  options.canvas.height = outputHeight;

  const pipeline = await createRenderPipeline({
    canvas: options.canvas,
    nativeWidth,
    nativeHeight,
    preferredBackend: options.backend,
    capabilities: detectWorkerGpuCapabilities(options.canvas, options.backend),
    allowCanvas2D: false,
    preset: options.preset
  }) as RenderPipeline;

  if (!isWorkerRenderBackend(pipeline.backend)) {
    throw new Error(`Worker pipeline resolved unsupported backend '${pipeline.backend}'`);
  }

  return {
    backend: pipeline.backend,
    render: (source: TexImageSource): void => {
      pipeline.renderFrame(source);
    },
    resize: (width: number, height: number): void => {
      pipeline.resize(width, height);
    },
    captureFrame: async (): Promise<ImageBitmap> => {
      return pipeline.captureFrame();
    },
    getStats: (): RenderStats => {
      return pipeline.getStats();
    },
    dispose: async (): Promise<void> => {
      await pipeline.dispose();
    },
    setPreset: (preset: RenderPreset): void => {
      pipeline.setPreset(preset);
    },
    setBrightness: (value: number): void => {
      pipeline.setBrightness(value);
    }
  };
}
