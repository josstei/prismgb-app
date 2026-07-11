import type { BrowserCapabilityProbeResult, RenderCapabilities } from './domain/types';

export {
  createGpuVideoRendererSession,
  type GpuVideoRendererSession,
  type GpuVideoRendererSessionOptions,
  type GpuVideoHarnessObservation,
  type GpuVideoFrameMeasurementContext,
  type GpuVideoPerformanceObservation
} from './application/video-session';

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities: detect } = await import('./infrastructure/capabilities.browser');
  return detect();
}

export async function probeBrowserGpuCapabilitiesForMeasurement(): Promise<BrowserCapabilityProbeResult | null> {
  if (
    typeof __PRISMGB_PERF_HARNESS__ === 'undefined' ||
    !__PRISMGB_PERF_HARNESS__ ||
    typeof window === 'undefined' ||
    window.prismgbPerformanceLaunchMarker === undefined
  ) {
    return null;
  }

  const { probeBrowserGpuCapabilities } = await import('./infrastructure/capabilities.measurement.browser');
  return probeBrowserGpuCapabilities();
}

export type { GpuVideoRendererStats } from './domain/types';
