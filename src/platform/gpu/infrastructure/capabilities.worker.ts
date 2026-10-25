import type { RenderCapabilities } from '../domain/types';

export function detectWorkerGpuCapabilities(): RenderCapabilities {
  const webgpuSupported = typeof navigator !== 'undefined' && Boolean(navigator.gpu);

  return {
    webgpu: webgpuSupported,
    transferControlToOffscreen: false,
    preferredBackend: 'webgpu'
  };
}
