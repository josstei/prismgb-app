import type { RenderCapabilities, WebGPULimits } from '../domain/types';

async function detectWebGPU(): Promise<{ supported: boolean; limits?: WebGPULimits }> {
  if (typeof navigator === 'undefined' || !navigator.gpu) {
    return { supported: false };
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return { supported: false };
    }

    const device = await adapter.requestDevice();
    const limits: WebGPULimits = {
      maxTextureDimension2D: device.limits.maxTextureDimension2D,
      maxBindGroups: device.limits.maxBindGroups
    };

    device.destroy();
    return { supported: true, limits };
  } catch {
    return { supported: false };
  }
}

function detectOffscreenCanvas(): { supported: boolean; transferSupported: boolean } {
  const supported = typeof OffscreenCanvas !== 'undefined';
  let transferSupported = false;

  if (supported && typeof document !== 'undefined') {
    try {
      const canvas = document.createElement('canvas');
      canvas.transferControlToOffscreen();
      transferSupported = true;
    } catch {
      transferSupported = false;
    }
  }

  return { supported, transferSupported };
}

export async function detectBrowserGpuCapabilities(): Promise<RenderCapabilities> {
  const [webgpuResult, offscreenResult] = await Promise.all([
    detectWebGPU(),
    Promise.resolve(detectOffscreenCanvas())
  ]);

  return {
    webgpu: webgpuResult.supported,
    offscreenCanvas: offscreenResult.supported,
    transferControlToOffscreen: offscreenResult.transferSupported,
    preferredBackend: webgpuResult.supported ? 'webgpu' : 'canvas2d',
    maxTextureSize: webgpuResult.limits?.maxTextureDimension2D ?? 4096,
    webgpuLimits: webgpuResult.limits
  };
}
