import { CapabilityDetector } from '@renderer/infrastructure/rendering/capability-detector.utils.js';
import { calculateNativeScaleFactor } from '@renderer/infrastructure/services/streaming/native-resolution.utils.js';
import type { Dimensions } from '@renderer/infrastructure/services/streaming/streaming-contracts.js';
import type { IPipelineCapabilities, RenderAPI } from '@prismgb/gpu';
import type { WorkerRendererConfig } from '@renderer/infrastructure/rendering/workers/worker-protocol.config.js';

export type RendererCapabilities = IPipelineCapabilities & {
  gpuPolicyApplied: boolean;
  gpuPolicyReason: string | null;
};

export function isWorkerRenderAPI(value: RenderAPI): value is WorkerRendererConfig['api'] {
  return value === 'webgpu' || value === 'webgl2';
}

export async function detectCapabilities(): Promise<RendererCapabilities> {
  const caps = await CapabilityDetector.detect();
  return caps as RendererCapabilities;
}

export function computeRendererConfig(
  nativeResolution: Dimensions,
  clientWidth: number,
  clientHeight: number,
  preferredAPI: RenderAPI,
  savedPresetId: string
): {
  scaleFactor: number;
  targetWidth: number;
  targetHeight: number;
  config: WorkerRendererConfig;
} {
  const scaleFactor = calculateNativeScaleFactor(
    nativeResolution,
    clientWidth,
    clientHeight
  );
  const targetWidth = nativeResolution.width * scaleFactor;
  const targetHeight = nativeResolution.height * scaleFactor;

  const api = isWorkerRenderAPI(preferredAPI) ? preferredAPI : 'webgl2';

  const config: WorkerRendererConfig = {
    nativeWidth: nativeResolution.width,
    nativeHeight: nativeResolution.height,
    targetWidth,
    targetHeight,
    scaleFactor,
    api,
    presetId: savedPresetId
  };

  return { scaleFactor, targetWidth, targetHeight, config };
}
