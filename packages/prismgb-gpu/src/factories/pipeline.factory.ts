import type { IPipeline, IPipelineConfig, IPipelineCapabilities } from '../domain/pipeline';
import type { IPreset } from '../domain/presets';
import { PresetRegistry } from '../domain/presets';
import { WebGPUPipeline } from '../infrastructure/webgpu/webgpu-pipeline';
import { WebGL2Pipeline } from '../infrastructure/webgl2/webgl2-pipeline';
import { Canvas2DPipeline } from '../infrastructure/canvas2d/canvas2d-pipeline';
import { detectCapabilities } from '../application/capability-detector';

export interface CreatePipelineOptions extends IPipelineConfig {
  capabilities?: IPipelineCapabilities;
}

export async function createPipeline(options: CreatePipelineOptions): Promise<IPipeline> {
  const capabilities = options.capabilities ?? await detectCapabilities();
  const preset = options.preset ?? PresetRegistry.getDefault();
  const preferredAPI = options.preferredAPI ?? capabilities.preferredAPI;

  const baseConfig = {
    canvas: options.canvas,
    nativeWidth: options.nativeWidth,
    nativeHeight: options.nativeHeight,
    preset
  };

  let pipeline: IPipeline;

  switch (preferredAPI) {
    case 'webgpu':
      if (capabilities.webgpu) {
        pipeline = new WebGPUPipeline(baseConfig);
        try {
          await pipeline.initialize();
          return pipeline;
        } catch {
          // Fall through to WebGL2
        }
      }
    // falls through
    case 'webgl2':
      if (capabilities.webgl2) {
        pipeline = new WebGL2Pipeline(baseConfig);
        try {
          await pipeline.initialize();
          return pipeline;
        } catch {
          // Fall through to Canvas2D
        }
      }
    // falls through
    case 'canvas2d':
    default:
      pipeline = new Canvas2DPipeline(baseConfig);
      await pipeline.initialize();
      return pipeline;
  }
}
