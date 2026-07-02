import type { RenderBackend, RenderCanvas, RenderCapabilities } from '../domain/types';

function isOffscreenCanvas(canvas: RenderCanvas): boolean {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

export function detectWorkerGpuCapabilities(
  canvas: RenderCanvas,
  preferredBackend?: RenderBackend
): RenderCapabilities {
  const webgpuSupported = preferredBackend === 'webgpu' && typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  const resolvedPreferredBackend = preferredBackend ?? (webgpuSupported ? 'webgpu' : 'canvas2d');

  return {
    webgpu: webgpuSupported,
    offscreenCanvas: isOffscreenCanvas(canvas),
    transferControlToOffscreen: false,
    preferredBackend: resolvedPreferredBackend,
    maxTextureSize: 4096
  };
}
