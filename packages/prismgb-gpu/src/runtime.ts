import type { RenderCapabilities } from './domain/types';

export { createCanvas2DRenderPipeline } from './application/canvas2d-render-pipeline';
export {
  createRenderPipeline,
  type CreateRenderPipelineOptions
} from './application/render-pipeline';
export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities: detect } = await import('./infrastructure/capabilities.browser');
  return detect();
}
export type {
  RenderBackend,
  RenderCapabilities,
  RenderCanvas,
  RenderPipeline,
  RenderPipelineConfig,
  RenderPreset,
  RenderStats,
  WebGL2Info,
  WebGPULimits
} from './domain/types';
export { RecoverableBackendInitializationError } from './domain/errors';
