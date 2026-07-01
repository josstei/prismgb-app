import { getPackageDefaultPreset } from './preset-catalog';
import type { RenderPipeline, RenderPipelineConfig } from '../domain/types';
import { Canvas2DPipeline } from '../infrastructure/canvas2d/canvas2d-pipeline';

export async function createCanvas2DRenderPipeline(
  options: RenderPipelineConfig
): Promise<RenderPipeline> {
  const pipeline = new Canvas2DPipeline({
    canvas: options.canvas,
    nativeWidth: options.nativeWidth,
    nativeHeight: options.nativeHeight,
    preset: options.preset ?? getPackageDefaultPreset()
  });
  await pipeline.initialize();
  return pipeline;
}
