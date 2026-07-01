import type { RenderCapabilities } from './domain/types';

export {
  createGpuVideoRendererSession,
  type GpuVideoRendererSession,
  type GpuVideoRendererSessionOptions
} from './application/video-session';

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
  GpuVideoRendererStats,
  GpuVideoRendererError,
  WebGPULimits
} from './domain/types';

export { RecoverableBackendInitializationError } from './domain/errors';
