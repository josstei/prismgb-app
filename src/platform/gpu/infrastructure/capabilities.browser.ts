import type { RenderCapabilities } from '../domain/types';

async function detectWebGPU(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return false;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return false;
    }

    const device = await adapter.requestDevice();
    device.destroy();
    return true;
  } catch {
    return false;
  }
}

function canTransferCanvas(): boolean {
  if (typeof OffscreenCanvas === 'undefined' || typeof document === 'undefined') return false;
  try {
    document.createElement('canvas').transferControlToOffscreen();
    return true;
  } catch {
    return false;
  }
}

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const [webgpu, transferControlToOffscreen] = await Promise.all([
    detectWebGPU(),
    Promise.resolve(canTransferCanvas())
  ]);

  return {
    webgpu,
    transferControlToOffscreen,
    preferredBackend: webgpu ? 'webgpu' : 'canvas2d'
  };
}
