import type { RenderBackend, RenderCanvas, RenderCapabilities, WebGL2Info } from '../domain/types';

function createWebGL2ProbeCanvas(): RenderCanvas | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(1, 1);
  }

  return null;
}

function detectCanvasWebGL2(
  canvas: RenderCanvas,
  options: { releaseContext: boolean }
): { supported: boolean; info?: WebGL2Info } {
  try {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power'
    }) as WebGL2RenderingContext | null;

    if (!gl) {
      return { supported: false };
    }

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const result = {
      supported: true,
      info: {
        renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'worker-canvas',
        vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'worker-canvas',
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
      }
    };

    if (options.releaseContext) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    return result;
  } catch {
    return { supported: false };
  }
}

function isOffscreenCanvas(canvas: RenderCanvas): boolean {
  return typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas;
}

export function detectWorkerGpuCapabilities(
  canvas: RenderCanvas,
  preferredBackend?: RenderBackend
): RenderCapabilities {
  const webgpuSupported = preferredBackend === 'webgpu' && typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  const disposableWebGL2ProbeCanvas = webgpuSupported ? createWebGL2ProbeCanvas() : null;
  const webgl2ProbeCanvas = disposableWebGL2ProbeCanvas ?? (webgpuSupported ? null : canvas);
  const webgl2Result = preferredBackend !== 'canvas2d' && webgl2ProbeCanvas
    ? detectCanvasWebGL2(webgl2ProbeCanvas, { releaseContext: Boolean(disposableWebGL2ProbeCanvas) })
    : { supported: false };
  const resolvedPreferredBackend = preferredBackend
    ?? (webgpuSupported ? 'webgpu' : webgl2Result.supported ? 'webgl2' : 'canvas2d');

  return {
    webgpu: webgpuSupported,
    webgl2: webgl2Result.supported,
    offscreenCanvas: isOffscreenCanvas(canvas),
    transferControlToOffscreen: false,
    preferredBackend: resolvedPreferredBackend,
    maxTextureSize: webgl2Result.info?.maxTextureSize ?? 4096,
    webgl2Info: webgl2Result.info
  };
}
