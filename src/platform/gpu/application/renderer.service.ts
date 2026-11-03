import type { RenderPipeline, RenderPipelineConfig } from '../domain/types';
import { CanvasDriver } from '../infrastructure/canvas.driver';
import { PipelineController } from '../infrastructure/pipeline-controller';

/** Initialize one backend. Its caller owns fallback and canvas replacement. */
export async function createGpuRenderer(options: RenderPipelineConfig): Promise<RenderPipeline> {
  const driver = options.backend === 'canvas2d'
    ? new CanvasDriver()
    : new (await import('../infrastructure/webgpu.driver')).WebGpuDriver();
  const renderer = new PipelineController(options, driver);

  try {
    await renderer.initialize();
    return renderer;
  } catch (error) {
    await renderer.dispose().catch(() => undefined);
    throw error;
  }
}
