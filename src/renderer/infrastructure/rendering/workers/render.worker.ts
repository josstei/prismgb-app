import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage
} from './worker-protocol.config.js';
import {
  WebGPUPipeline,
  WebGL2Pipeline,
  CaptureBuffer,
  type IPipeline,
  type IPipelineOptions,
  type IPipelineError
} from '@prismgb/gpu';

let pipeline: IPipeline | null = null;
let captureBuffer: CaptureBuffer | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;
let frameCount = 0;
let lastStatsTime = performance.now();
let totalFrameTime = 0;

function forwardPipelineError(error: IPipelineError): void {
  self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
    message: error.message,
    code: error.code,
    adapterInfo: error.adapterInfo || null
  }));
}

self.onmessage = async (event: MessageEvent) => {
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

async function handleInit(payload: any): Promise<void> {
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

    pipeline = config.api === 'webgpu'
      ? new WebGPUPipeline()
      : new WebGL2Pipeline();

    const options: IPipelineOptions = {
      canvas: canvasToUse,
      config: {
        nativeWidth: config.nativeWidth,
        nativeHeight: config.nativeHeight,
        targetWidth: config.targetWidth,
        targetHeight: config.targetHeight
      },
      callbacks: {
        onError: forwardPipelineError
      }
    };

    await pipeline.initialize(options);
    isInitialized = true;

    captureBuffer = new CaptureBuffer(canvasToUse);

    self.postMessage(createWorkerResponse(WorkerResponseType.READY, {
      api: config.api
    }));
  } catch (error: any) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      stack: error.stack,
      code: 'INIT_FAILED',
      adapterInfo: pipeline?.getAdapterInfo() || null
    }));
  }
}

async function handleFrame(payload: any): Promise<void> {
  const { imageBitmap, uniforms } = payload;

  if (!isInitialized || !pipeline || pipeline.state !== 'ready') {
    imageBitmap?.close();
    return;
  }

  const frameStart = performance.now();

  try {
    pipeline.renderFrame(imageBitmap, uniforms);

    if (captureBuffer?.hasPendingCapture()) {
      await captureBuffer.onFrameRendered();
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
  } catch (error: any) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RENDER_FAILED',
      adapterInfo: pipeline?.getAdapterInfo() || null
    }));
  } finally {
    imageBitmap?.close();
  }
}

function handleResize(payload: any): void {
  if (!isInitialized || !pipeline) return;

  try {
    const { width, height } = payload;
    pipeline.resize(width, height);
  } catch (error: any) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: error.message,
      code: 'RESIZE_FAILED'
    }));
  }
}

function handleSetPreset(_payload: any): void {
}

function handleRequestCapture(): void {
  if (!captureBuffer) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }

  captureBuffer.armCapture();
  self.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED, {}));
}

async function handleCapture(): Promise<void> {
  if (!captureBuffer) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Capture manager not initialized',
      code: 'NO_CAPTURE_MANAGER'
    }));
    return;
  }

  if (captureBuffer.hasCapturedFrame()) {
    const frameToSend = captureBuffer.retrieveCapture()!;
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      { transfer: [frameToSend] } as any
    );
    return;
  }

  try {
    const capturedFrame = await captureBuffer.captureImmediate();
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: capturedFrame
      }),
      { transfer: [capturedFrame] } as any
    );
  } catch (error: any) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'Failed to capture frame: ' + error.message,
      code: 'CAPTURE_FAILED'
    }));
  }
}

function handleRelease(): void {
  if (captureBuffer) {
    captureBuffer.dispose();
    captureBuffer = null;
  }

  if (pipeline) {
    pipeline.dispose();
    pipeline = null;
  }

  isInitialized = false;
  frameCount = 0;
  totalFrameTime = 0;
  lastStatsTime = performance.now();

  self.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
}

function handleDestroy(): void {
  if (captureBuffer) {
    captureBuffer.dispose();
    captureBuffer = null;
  }

  if (pipeline) {
    pipeline.dispose();
    pipeline = null;
  }

  isInitialized = false;
  canvas = null;

  self.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
  self.close();
}
