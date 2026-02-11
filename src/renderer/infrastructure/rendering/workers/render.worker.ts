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

type WorkerInitConfig = {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  api: 'webgpu' | 'webgl2';
};

type WorkerInitPayload = {
  canvas?: OffscreenCanvas;
  config: WorkerInitConfig;
};

type WorkerFramePayload = {
  imageBitmap: ImageBitmap;
  uniforms: unknown;
};

type WorkerResizePayload = {
  width: number;
  height: number;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object');
}

function isWorkerInitPayload(payload: unknown): payload is WorkerInitPayload {
  if (!isObjectRecord(payload)) {
    return false;
  }

  const config = payload.config;
  if (!isObjectRecord(config)) {
    return false;
  }

  return (
    typeof config.nativeWidth === 'number' &&
    typeof config.nativeHeight === 'number' &&
    typeof config.targetWidth === 'number' &&
    typeof config.targetHeight === 'number' &&
    (config.api === 'webgpu' || config.api === 'webgl2')
  );
}

function isWorkerFramePayload(payload: unknown): payload is WorkerFramePayload {
  if (!isObjectRecord(payload)) {
    return false;
  }

  return payload.imageBitmap instanceof ImageBitmap && 'uniforms' in payload;
}

function isWorkerResizePayload(payload: unknown): payload is WorkerResizePayload {
  if (!isObjectRecord(payload)) {
    return false;
  }

  return typeof payload.width === 'number' && typeof payload.height === 'number';
}

function getErrorDetails(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack };
  }

  return { message: String(error) };
}

function forwardPipelineError(error: IPipelineError): void {
  self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
    message: error.message,
    code: error.code,
    adapterInfo: error.adapterInfo || null
  }));
}

function isPipelineError(error: unknown): error is IPipelineError {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    'message' in error &&
    'recoverable' in error
  );
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

  const typedMessage = message as { type: string; payload: unknown };
  const { type, payload } = typedMessage;

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

async function handleInit(payload: unknown): Promise<void> {
  try {
    if (!isWorkerInitPayload(payload)) {
      throw new Error('Invalid init payload');
    }

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
  } catch (error: unknown) {
    const details = getErrorDetails(error);
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: details.message,
      stack: details.stack,
      code: 'INIT_FAILED',
      adapterInfo: pipeline?.getAdapterInfo() || null
    }));
  }
}

async function handleFrame(payload: unknown): Promise<void> {
  if (!isWorkerFramePayload(payload)) {
    return;
  }

  const { imageBitmap, uniforms } = payload;

  if (!isInitialized || !pipeline || pipeline.state !== 'ready') {
    imageBitmap?.close();
    return;
  }

  const frameStart = performance.now();

  try {
    pipeline.renderFrame(imageBitmap, uniforms as Parameters<IPipeline['renderFrame']>[1]);

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
  } catch (error: unknown) {
    // BasePipeline forwards structured pipeline errors through onError callback.
    if (!isPipelineError(error)) {
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: getErrorDetails(error).message,
        code: 'RENDER_FAILED',
        adapterInfo: pipeline?.getAdapterInfo() || null
      }));
    }
  } finally {
    imageBitmap?.close();
  }
}

function handleResize(payload: unknown): void {
  if (!isInitialized || !pipeline) return;

  try {
    if (!isWorkerResizePayload(payload)) {
      throw new Error('Invalid resize payload');
    }

    const { width, height } = payload;
    pipeline.resize(width, height);
  } catch (error: unknown) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: getErrorDetails(error).message,
      code: 'RESIZE_FAILED'
    }));
  }
}

function handleSetPreset(_payload: unknown): void {
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
    const frameToSend = captureBuffer.retrieveCapture();
    if (!frameToSend) {
      self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
        message: 'Capture frame missing',
        code: 'CAPTURE_FAILED'
      }));
      return;
    }

    const transferOptions: StructuredSerializeOptions = { transfer: [frameToSend] };
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      transferOptions
    );
    return;
  }

  try {
    const capturedFrame = await captureBuffer.captureImmediate();
    const transferOptions: StructuredSerializeOptions = { transfer: [capturedFrame] };
    self.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: capturedFrame
      }),
      transferOptions
    );
  } catch (error: unknown) {
    self.postMessage(createWorkerResponse(WorkerResponseType.ERROR, {
      message: `Failed to capture frame: ${getErrorDetails(error).message}`,
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
