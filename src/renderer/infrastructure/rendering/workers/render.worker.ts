/** Render worker composition root and message router. */
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage
} from './worker-protocol.config.js';
import { CaptureBufferManager } from './optimization.utils.js';
import { WebGPURenderer } from './webgpu-renderer.engine.js';
import { WebGL2Renderer } from './webgl2-renderer.engine.js';
let renderer = null;
let canvas = null;
let isInitialized = false;
let frameCount = 0;
let lastStatsTime = performance.now();
let totalFrameTime = 0;
let captureManager = null;
self.onmessage = async (event) => {
  const message = event.data;
  if (!isValidWorkerMessage(message)) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Invalid message format',
      code: 'INVALID_MESSAGE'
    }));
    return;
  }
  const { type, payload } = message;
  switch (type) {
    case WorkerMessageType.INIT:
      await handleInit(payload);
      break;
    case WorkerMessageType.FRAME:
      handleFrame(payload);
      break;
    case WorkerMessageType.RESIZE:
      handleResize(payload);
      break;
    case WorkerMessageType.SET_PRESET:
      handleSetPreset(payload);
      break;
    case WorkerMessageType.REQUEST_CAPTURE:
      handleRequestCapture();
      break;
    case WorkerMessageType.CAPTURE:
      handleCapture();
      break;
    case WorkerMessageType.RELEASE:
      handleRelease();
      break;
    case WorkerMessageType.DESTROY:
      handleDestroy();
      break;
    default:
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: `Unknown message type: ${type}`,
        code: 'UNKNOWN_MESSAGE'
      }));
  }
};
async function handleInit(payload) {
  try {
    const { canvas: offscreenCanvas, config } = payload;
    const canvasToUse = offscreenCanvas || canvas;
    if (!canvasToUse) {
      throw new Error('No canvas available for initialization');
    }
    if (offscreenCanvas) {
      canvas = offscreenCanvas;
    }
    canvasToUse.width = config.targetWidth;
    canvasToUse.height = config.targetHeight;
    if (config.api === 'webgpu') {
      renderer = new WebGPURenderer();
    } else {
      renderer = new WebGL2Renderer();
    }
    await renderer.initialize(canvasToUse, config);
    isInitialized = true;
    captureManager = new CaptureBufferManager();
    captureManager.initialize(canvasToUse);
    self.postMessage(createWorkerResponse(WorkerResponseType.READY, {
      api: config.api
    }));
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      stack: error.stack,
      code: 'INIT_FAILED',
      adapterInfo: renderer?.adapterInfo || null
    }));
  }
}
async function handleFrame(payload) {
  if (!isInitialized || !renderer) return;
  if (renderer.hasError) return;
  const frameStart = performance.now();
  const { imageBitmap, uniforms } = payload;
  try {
    renderer.uploadFrame(imageBitmap);
    renderer.render(uniforms);
    if (captureManager?.hasPendingCapture()) {
      await captureManager.onFrameRendered();
    }
    const frameTime = performance.now() - frameStart;
    frameCount++;
    totalFrameTime += frameTime;
    const now = performance.now();
    if (now - lastStatsTime >= 1000) {
      const avgFrameTime = totalFrameTime / frameCount;
      self.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
        fps: frameCount,
        frameTime: avgFrameTime.toFixed(2)
      }));
      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = now;
    }
    self.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RENDER_FAILED',
      adapterInfo: renderer?.adapterInfo || null
    }));
  } finally {
    imageBitmap?.close();
  }
}
function handleResize(payload) {
  if (!isInitialized || !renderer) return;
  try {
    const { width, height, scaleFactor } = payload;
    renderer.config.scaleFactor = scaleFactor;
    renderer.resize(width, height);
    // Update canvas size
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RESIZE_FAILED'
    }));
  }
}
function handleSetPreset(_payload) {
  // Reserved for preset-specific resource updates.
}
function handleRequestCapture() {
  if (!captureManager) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }
  captureManager.requestCapture();
  self.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED, {}));
}
async function handleCapture() {
  if (!captureManager) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }
  if (captureManager.hasCapturedFrame()) {
    const frameToSend = captureManager.getCapturedFrame();
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      { transfer: [frameToSend] }
    );
    return;
  }
  try {
    const capturedFrame = await createImageBitmap(canvas);
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: capturedFrame
      }),
      { transfer: [capturedFrame] }
    );
  } catch (error) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Failed to capture frame: ' + error.message,
      code: 'CAPTURE_FAILED'
    }));
  }
}
function handleRelease() {
  if (captureManager) {
    captureManager.destroy();
    captureManager = null;
  }
  if (renderer) {
    if (renderer.hasError) {
      renderer.hasError = false;
      renderer.errorMessage = null;
    }
    renderer.destroy();
    renderer = null;
  }
  isInitialized = false;
  // Keep canvas reference for future re-init.
  frameCount = 0;
  totalFrameTime = 0;
  lastStatsTime = performance.now();
  self.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
}
function handleDestroy() {
  if (captureManager) {
    captureManager.destroy();
    captureManager = null;
  }
  if (renderer) {
    renderer.destroy();
    renderer = null;
  }
  isInitialized = false;
  canvas = null;
  self.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
  self.close();
}
