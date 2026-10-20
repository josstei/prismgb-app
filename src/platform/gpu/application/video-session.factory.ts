import type { RenderBackend, RenderCapabilities } from '../domain/types';
import { Canvas2dSessionAdapter } from './canvas2d-session.adapter';
import { WebGpuSessionAdapter } from './webgpu-session.adapter';

export type GpuVideoRendererSession = {
  readonly backend: RenderBackend;
  readonly isActive: boolean;
  readonly isCanvasTransferred: boolean;
  renderFrame(video: HTMLVideoElement): Promise<void>;
  resize(width: number, height: number): void;
  setPreset(presetId: string): void;
  setBrightness(value: number): void;
  getTargetDimensions(): { width: number; height: number };
  captureFrame(): Promise<ImageBitmap>;
  terminate(options?: { emitCanvasExpired?: boolean }): void;
};

export type GpuVideoRendererSessionOptions = {
  canvas: HTMLCanvasElement;
  nativeResolution: { width: number; height: number };
  preferredBackend?: RenderBackend;
  presetId?: string | null;
  brightness?: number;
  allowCanvas2D?: boolean;
  createWorker?: () => Worker;
  capabilities?: RenderCapabilities;
  onReady?: (event: { backend: RenderBackend }) => void;
  onError?: (error: { message: string; code?: string }) => void;
  onCanvasExpired?: () => void;
  logger?: Pick<Console, 'error' | 'info'>;
};

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const { detectBrowserGpuCapabilities: detect } = await import('../infrastructure/capabilities.browser');
  return detect();
}

export async function createGpuVideoRendererSession(
  options: GpuVideoRendererSessionOptions
): Promise<GpuVideoRendererSession> {
  const capabilities = options.capabilities ?? await detectBrowserGpuCapabilities();
  const canUseWebgpu = capabilities.webgpu
    && capabilities.transferControlToOffscreen
    && options.preferredBackend !== 'canvas2d';

  if (!canUseWebgpu && options.allowCanvas2D === false) {
    throw new Error('No accelerated render backend available');
  }

  return canUseWebgpu
    ? WebGpuSessionAdapter.create(options)
    : Canvas2dSessionAdapter.create(options);
}
