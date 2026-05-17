/** Render worker composition root and message router. */
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage
} from './worker-protocol.config.js';
import type {
  FramePayload,
  InitPayload,
  PresetPayload,
  ResizePayload,
  WorkerErrorPayload
} from './worker-protocol.config.js';
import { CaptureBufferManager } from './optimization.utils.js';
import { WebGPURenderer } from './webgpu-renderer.engine.js';
import { WebGL2Renderer } from './webgl2-renderer.engine.js';

import { getErrorMessage } from '@shared/lib/errors/error-guards.js';
import type { RenderConfig } from './engine.types.js';

type WorkerScopeLike = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

type WorkerRenderer = {
  hasError?: boolean;
  errorMessage?: string | null;
  adapterInfo?: object | null;
  config: RenderConfig | null;
  initialize(canvas: OffscreenCanvas, config: RenderConfig): Promise<void>;
  uploadFrame(imageBitmap: ImageBitmap): void;
  render(uniforms: FramePayload['uniforms']): void;
  resize(width: number, height: number): void;
  destroy(): void;
};

const workerScope = self as WorkerScopeLike;

let renderer: WorkerRenderer | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;
let frameCount = 0;
let lastStatsTime = performance.now();
let totalFrameTime = 0;
let captureManager: CaptureBufferManager | null = null;

function postWorkerError(payload: WorkerErrorPayload): void {
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.ERROR, payload));
}

workerScope.onmessage = async (event) => {
  const message = event.data;
  if (!isValidWorkerMessage(message)) {
    postWorkerError({
      message: 'Invalid message format',
      code: 'INVALID_MESSAGE'
    });
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
  }
};

async function handleInit(payload: InitPayload): Promise<void> {
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
    workerScope.postMessage(createWorkerResponse(WorkerResponseType.READY, {
      api: config.api
    }));
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: 'INIT_FAILED',
      adapterInfo: renderer?.adapterInfo || null
    });
  }
}

async function handleFrame(payload: FramePayload): Promise<void> {
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
      workerScope.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
        fps: frameCount,
        frameTime: Number(avgFrameTime.toFixed(2))
      }));
      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = now;
    }
    workerScope.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      code: 'RENDER_FAILED',
      adapterInfo: renderer?.adapterInfo || null
    });
  } finally {
    imageBitmap?.close();
  }
}

function handleResize(payload: ResizePayload): void {
  if (!isInitialized || !renderer) return;
  try {
    const { width, height, scaleFactor } = payload;
    if (renderer.config) {
      renderer.config.scaleFactor = scaleFactor;
    }
    renderer.resize(width, height);
    // Update canvas size
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
    }
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      code: 'RESIZE_FAILED'
    });
  }
}

function handleSetPreset(_payload: PresetPayload): void {
  // Reserved for preset-specific resource updates.
}

function handleRequestCapture(): void {
  if (!captureManager) {
    postWorkerError({
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    });
    return;
  }
  captureManager.requestCapture();
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED));
}

async function handleCapture(): Promise<void> {
  if (!captureManager) {
    postWorkerError({
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    });
    return;
  }
  if (!canvas) {
    postWorkerError({
      message: 'Canvas not initialized',
      code: 'NO_CANVAS'
    });
    return;
  }
  if (captureManager.hasCapturedFrame()) {
    const frameToSend = captureManager.getCapturedFrame();
    if (!frameToSend) {
      postWorkerError({
        message: 'Captured frame was unavailable',
        code: 'CAPTURE_FAILED'
      });
      return;
    }
    workerScope.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      [frameToSend]
    );
    return;
  }
  try {
    const capturedFrame = await createImageBitmap(canvas);
    workerScope.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: capturedFrame
      }),
      [capturedFrame]
    );
  } catch (error) {
    postWorkerError({
      message: `Failed to capture frame: ${getErrorMessage(error)}`,
      code: 'CAPTURE_FAILED'
    });
  }
}

function handleRelease(): void {
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
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
}

function handleDestroy(): void {
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
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
  workerScope.close();
}
