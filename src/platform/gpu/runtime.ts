import type { RenderCapabilities } from './domain/types';

export {
  createGpuVideoRendererSession,
  type GpuVideoRendererSession
} from './application/video-session';

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities: detect } = await import('./infrastructure/capabilities.browser');
  return detect();
}

export type { GpuVideoRendererStats } from './domain/types';
