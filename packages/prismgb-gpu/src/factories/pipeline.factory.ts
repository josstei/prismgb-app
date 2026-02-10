import type { IPipeline, IPipelineCapabilities, IPipelineOptions, RenderAPI } from '../domain/pipeline';
import type { IPreset } from '../domain/presets';
import { PresetRegistry } from '../domain/presets';
import { WebGPUPipeline } from '../infrastructure/webgpu/webgpu-pipeline';
import { WebGL2Pipeline } from '../infrastructure/webgl2/webgl2-pipeline';
import { Canvas2DPipeline } from '../infrastructure/canvas2d/canvas2d-pipeline';
import { detectCapabilities } from '../application/capability-detector';

export interface CreatePipelineOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  preset?: IPreset;
  preferredAPI?: RenderAPI;
  capabilities?: IPipelineCapabilities;
}

export async function createPipeline(options: CreatePipelineOptions): Promise<IPipeline> {
  const capabilities = options.capabilities ?? await detectCapabilities();
  const preset = options.preset ?? PresetRegistry.getDefault();
  const preferredAPI = options.preferredAPI ?? capabilities.preferredAPI;

  const pipelineOptions: IPipelineOptions = {
    canvas: options.canvas,
    config: {
      nativeWidth: options.nativeWidth,
      nativeHeight: options.nativeHeight,
      targetWidth: options.targetWidth,
      targetHeight: options.targetHeight
    },
    preset
  };

  let pipeline: IPipeline;

  switch (preferredAPI) {
    case 'webgpu':
      if (capabilities.webgpu) {
        pipeline = new WebGPUPipeline();
        try {
          await pipeline.initialize(pipelineOptions);
          return pipeline;
        } catch {
        }
      }
    case 'webgl2':
      if (capabilities.webgl2) {
        pipeline = new WebGL2Pipeline();
        try {
          await pipeline.initialize(pipelineOptions);
          return pipeline;
        } catch {
        }
      }
    case 'canvas2d':
    default:
      pipeline = new Canvas2DPipeline();
      await pipeline.initialize(pipelineOptions);
      return pipeline;
  }
}
