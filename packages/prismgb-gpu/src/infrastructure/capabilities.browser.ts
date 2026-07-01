import type { RenderCapabilities, WebGL2Info, WebGPULimits } from '../domain/types';

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

function detectWebGL2(): { supported: boolean; info?: WebGL2Info } {
  if (typeof document === 'undefined') {
    return { supported: false };
  }

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');

  if (!gl) {
    return { supported: false };
  }

  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const info: WebGL2Info = {
    renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown',
    vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown',
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
  };

  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return { supported: true, info };
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
  const [webgpuResult, webgl2Result, offscreenResult] = await Promise.all([
    detectWebGPU(),
    Promise.resolve(detectWebGL2()),
    Promise.resolve(detectOffscreenCanvas())
  ]);

  const preferredBackend = webgpuResult.supported
    ? 'webgpu'
    : webgl2Result.supported
      ? 'webgl2'
      : 'canvas2d';

  const maxTextureSize = webgpuResult.limits?.maxTextureDimension2D
    ?? webgl2Result.info?.maxTextureSize
    ?? 4096;

  return {
    webgpu: webgpuResult.supported,
    webgl2: webgl2Result.supported,
    offscreenCanvas: offscreenResult.supported,
    transferControlToOffscreen: offscreenResult.transferSupported,
    preferredBackend,
    maxTextureSize,
    webgpuLimits: webgpuResult.limits,
    webgl2Info: webgl2Result.info
  };
}
