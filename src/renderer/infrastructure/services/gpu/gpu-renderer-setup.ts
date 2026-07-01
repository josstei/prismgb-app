import { CapabilityDetector } from '@renderer/infrastructure/rendering/capability-detector.utils.js';
import { calculateNativeScaleFactor } from '@renderer/infrastructure/services/streaming/native-resolution.utils.js';
import type { Dimensions } from '@renderer/infrastructure/services/streaming/streaming-contracts.js';
import type { RenderCapabilities, RenderBackend } from '@prismgb/gpu';

export type RendererCapabilities = RenderCapabilities & {
  gpuPolicyApplied: boolean;
  gpuPolicyReason: string | null;
};

type WorkerRendererBackend = Extract<RenderBackend, 'webgpu' | 'webgl2'>;

type WorkerRendererClientConfig = {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  scaleFactor: number;
  backend: WorkerRendererBackend;
  presetId: string;
};

export function isWorkerRenderBackend(value: RenderBackend): value is WorkerRendererBackend {
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
  preferredBackend: RenderBackend,
  savedPresetId: string
): {
  scaleFactor: number;
  targetWidth: number;
  targetHeight: number;
  config: WorkerRendererClientConfig;
} {
  const scaleFactor = calculateNativeScaleFactor(
    nativeResolution,
    clientWidth,
    clientHeight
  );
  const targetWidth = nativeResolution.width * scaleFactor;
  const targetHeight = nativeResolution.height * scaleFactor;

  const backend = isWorkerRenderBackend(preferredBackend) ? preferredBackend : 'webgl2';

  const config: WorkerRendererClientConfig = {
    nativeWidth: nativeResolution.width,
    nativeHeight: nativeResolution.height,
    targetWidth,
    targetHeight,
    scaleFactor,
    backend,
    presetId: savedPresetId
  };

  return { scaleFactor, targetWidth, targetHeight, config };
}
