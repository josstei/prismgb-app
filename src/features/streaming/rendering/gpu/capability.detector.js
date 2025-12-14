/**
 * GPU Capability Detector
 *
 * Detects WebGPU and WebGL2 availability for the HD rendering pipeline.
 * Determines the optimal rendering API based on browser/hardware support.
 *
 * Detection hierarchy:
 * 1. WebGPU (preferred) - Modern API with compute shaders
 * 2. WebGL2 - Fallback with wide support
 * 3. Canvas2D - Final fallback (existing CanvasRenderer)
 */

/**
 * GPU capabilities result
 * @typedef {Object} GPUCapabilities
 * @property {boolean} webgpu - WebGPU is available
 * @property {boolean} webgl2 - WebGL2 is available
 * @property {boolean} offscreenCanvas - OffscreenCanvas is supported
 * @property {boolean} transferControlToOffscreen - Canvas can be transferred to worker
 * @property {number} maxTextureSize - Maximum texture dimension supported
 * @property {'webgpu'|'webgl2'|'canvas2d'} preferredAPI - Recommended API to use
 * @property {Object|null} webgpuLimits - WebGPU device limits (if available)
 * @property {Object|null} webgl2Info - WebGL2 context info (if available)
 */

/**
 * Detect GPU rendering capabilities
 * @returns {Promise<GPUCapabilities>} Detected capabilities
 */
async function detectCapabilities() {
  const capabilities = {
    webgpu: false,
    webgl2: false,
    offscreenCanvas: false,
    transferControlToOffscreen: false,
    maxTextureSize: 0,
    preferredAPI: 'canvas2d',
    webgpuLimits: null,
    webgl2Info: null
  };

  // Check OffscreenCanvas support
  capabilities.offscreenCanvas = typeof OffscreenCanvas !== 'undefined';

  // Check transferControlToOffscreen support
  capabilities.transferControlToOffscreen =
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';

  // Check WebGPU support
  try {
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter({
        powerPreference: 'high-performance'
      });

      if (adapter) {
        const device = await adapter.requestDevice();

        if (device) {
          capabilities.webgpu = true;
          capabilities.maxTextureSize = device.limits.maxTextureDimension2D;
          capabilities.webgpuLimits = {
            maxTextureDimension2D: device.limits.maxTextureDimension2D,
            maxBindGroups: device.limits.maxBindGroups,
            maxUniformBufferBindingSize: device.limits.maxUniformBufferBindingSize
          };

          // Clean up - destroy the test device
          device.destroy();
        }
      }
    }
  } catch {
    // WebGPU not available or failed to initialize
    capabilities.webgpu = false;
  }

  // Check WebGL2 support
  try {
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });

    if (gl) {
      capabilities.webgl2 = true;
      const maxTexSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      capabilities.maxTextureSize = Math.max(capabilities.maxTextureSize, maxTexSize);

      capabilities.webgl2Info = {
        maxTextureSize: maxTexSize,
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        vendor: gl.getParameter(gl.VENDOR),
        renderer: gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
      };

      // Clean up WebGL context
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext) {
        loseContext.loseContext();
      }
    }
  } catch {
    // WebGL2 not available
    capabilities.webgl2 = false;
  }

  // Determine preferred API
  // Prefer WebGPU if available and OffscreenCanvas is supported for worker rendering
  if (capabilities.webgpu && capabilities.transferControlToOffscreen) {
    capabilities.preferredAPI = 'webgpu';
  } else if (capabilities.webgl2 && capabilities.transferControlToOffscreen) {
    capabilities.preferredAPI = 'webgl2';
  } else if (capabilities.webgl2) {
    // WebGL2 on main thread (no worker)
    capabilities.preferredAPI = 'webgl2';
  } else {
    // Fall back to Canvas2D
    capabilities.preferredAPI = 'canvas2d';
  }

  return capabilities;
}

/**
 * Check if GPU rendering (WebGPU or WebGL2) is available
 * @param {GPUCapabilities} capabilities
 * @returns {boolean}
 */
function isGPURenderingAvailable(capabilities) {
  return capabilities.webgpu || capabilities.webgl2;
}

/**
 * Check if worker-based rendering is available
 * @param {GPUCapabilities} capabilities
 * @returns {boolean}
 */
function isWorkerRenderingAvailable(capabilities) {
  return capabilities.transferControlToOffscreen &&
    (capabilities.webgpu || capabilities.webgl2);
}

/**
 * Get a human-readable description of capabilities
 * @param {GPUCapabilities} capabilities
 * @returns {string}
 */
function describeCapabilities(capabilities) {
  const parts = [];

  if (capabilities.webgpu) {
    parts.push(`WebGPU (max texture: ${capabilities.webgpuLimits?.maxTextureDimension2D}px)`);
  }

  if (capabilities.webgl2) {
    parts.push(`WebGL2 (${capabilities.webgl2Info?.renderer || 'unknown GPU'})`);
  }

  if (capabilities.transferControlToOffscreen) {
    parts.push('OffscreenCanvas Worker');
  }

  if (parts.length === 0) {
    parts.push('Canvas2D only');
  }

  return `GPU Capabilities: ${parts.join(', ')} - Using: ${capabilities.preferredAPI}`;
}

export const CapabilityDetector = {
  detect: detectCapabilities,
  isGPURenderingAvailable,
  isWorkerRenderingAvailable,
  describeCapabilities
};
