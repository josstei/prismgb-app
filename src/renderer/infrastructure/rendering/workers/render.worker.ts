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
  WorkerErrorPayload,
  WorkerRendererConfig
} from './worker-protocol.config.js';
import { createWorkerPipeline, PresetRegistry, type IPreset, type WorkerPipeline } from '@prismgb/gpu';

import { getErrorMessage } from '@shared/lib/errors/error-guards.js';

type WorkerScopeLike = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

type WorkerRenderer = {
  config: WorkerRendererConfig;
  pipeline: WorkerPipeline;
  render(imageBitmap: ImageBitmap, uniforms: FramePayload['uniforms']): void;
  setPreset(preset: IPreset): void;
  resize(width: number, height: number, scaleFactor: number): void;
  captureFrame(): Promise<ImageBitmap>;
  getStats(): {
    fps: number;
    frameTime: number;
    gpuTime?: number;
    uploadTime?: number;
  };
  release(): Promise<void>;
};

const workerScope = self as WorkerScopeLike;

let renderer: WorkerRenderer | null = null;
let canvas: OffscreenCanvas | null = null;
let isInitialized = false;
let lastStatsTime = performance.now();
let captureRequested = false;
let captureFrame: ImageBitmap | null = null;
let activePreset: IPreset | null = null;
let lastBrightness = -1;

function postWorkerError(payload: WorkerErrorPayload): void {
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.ERROR, payload));
}

async function createRenderer(
  canvasToUse: OffscreenCanvas,
  config: WorkerRendererConfig,
  preset: IPreset
): Promise<WorkerRenderer> {
  const pipeline = await createWorkerPipeline({
    canvas: canvasToUse,
    api: config.api,
    nativeSize: [config.nativeWidth, config.nativeHeight],
    outputSize: [config.targetWidth, config.targetHeight],
    preset
  });

  const workerRenderer: WorkerRenderer = {
    config,
    pipeline,
    render: (imageBitmap, uniforms) => {
      updatePipelineBrightnessFromUniforms(uniforms);
      workerRenderer.pipeline.render(imageBitmap);
    },
    setPreset: (nextPreset) => {
      activePreset = nextPreset;
      lastBrightness = -1;
      workerRenderer.pipeline.setPreset(nextPreset);
    },
    resize: (width, height, scaleFactor) => {
      workerRenderer.config.scaleFactor = scaleFactor;
      workerRenderer.pipeline.resize(width, height);
    },
    captureFrame: () => workerRenderer.pipeline.captureFrame(),
    getStats: () => workerRenderer.pipeline.getStats(),
    release: async () => {
      await workerRenderer.pipeline.dispose();
    }
  };

  return workerRenderer;
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
      await handleFrame(payload);
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
      await handleCapture();
      break;
    case WorkerMessageType.RELEASE:
      await handleRelease();
      break;
    case WorkerMessageType.DESTROY:
      await handleDestroy();
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

    if (renderer) {
      await renderer.release();
    }
    activePreset = null;
    clearCaptureState();

    const preset = PresetRegistry.get(config.presetId) ?? PresetRegistry.getDefault();
    if (!preset) {
      throw new Error(`Preset '${config.presetId}' not found`);
    }

    const nextRenderer = await createRenderer(canvasToUse, config, preset);
    activePreset = preset;
    lastBrightness = -1;
    renderer = nextRenderer;

    isInitialized = true;
    captureRequested = false;
    lastStatsTime = performance.now();

    workerScope.postMessage(createWorkerResponse(WorkerResponseType.READY, {
      api: config.api
    }));
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      code: 'INIT_FAILED'
    });
  }
}

function clampBrightness(value: number): number {
  return Math.min(2, Math.max(0, value));
}

function resolveUniformBrightness(uniforms: FramePayload['uniforms'], preset: IPreset): number {
  if (!preset.color.enabled) {
    return uniforms.color.brightness;
  }

  if (preset.color.brightness <= 0) {
    return 0;
  }

  return uniforms.color.brightness / preset.color.brightness;
}

function updatePipelineBrightnessFromUniforms(
  uniforms: FramePayload['uniforms']
): void {
  if (!renderer || !activePreset) {
    return;
  }

  const nextBrightness = clampBrightness(resolveUniformBrightness(uniforms, activePreset));
  if (Number.isFinite(nextBrightness) && nextBrightness !== lastBrightness) {
    renderer.pipeline.setBrightness(nextBrightness);
    lastBrightness = nextBrightness;
  }
}

function clearCaptureState(): void {
  captureRequested = false;
  if (captureFrame) {
    captureFrame.close();
    captureFrame = null;
  }
}

async function handleFrame(payload: FramePayload): Promise<void> {
  if (!isInitialized || !renderer) return;

  const { imageBitmap, uniforms } = payload;
  try {
    renderer.render(imageBitmap, uniforms);

    if (captureRequested) {
      captureFrame = await renderer.captureFrame();
      captureRequested = false;
    }

    maybePostStats();

    workerScope.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      code: 'RENDER_FAILED'
    });
  } finally {
    imageBitmap?.close();
  }
}

function maybePostStats(): void {
  if (!renderer) {
    return;
  }

  const now = performance.now();
  if (now - lastStatsTime < 1000) {
    return;
  }

  const stats = renderer.getStats();
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
    fps: stats.fps,
    frameTime: Number(stats.frameTime.toFixed(2)),
    gpuTime: stats.gpuTime,
    uploadTime: stats.uploadTime
  }));
  lastStatsTime = now;
}

function handleResize(payload: ResizePayload): void {
  if (!isInitialized || !renderer) return;
  try {
    const { width, height, scaleFactor } = payload;
    renderer.resize(width, height, scaleFactor);

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

function handleSetPreset(payload: PresetPayload): void {
  if (!isInitialized || !renderer) return;

  try {
    renderer.setPreset(payload.preset);
    if (!activePreset) {
      activePreset = payload.preset;
    }
  } catch (error) {
    postWorkerError({
      message: getErrorMessage(error),
      code: 'PRESET_UPDATE_FAILED'
    });
  }
}

function handleRequestCapture(): void {
  if (!isInitialized || !renderer) {
    postWorkerError({
      message: 'Capture pipeline not initialized',
      code: 'NO_RENDERER'
    });
    return;
  }

  captureRequested = true;
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_REQUESTED));
}

async function handleCapture(): Promise<void> {
  if (!isInitialized || !renderer) {
    postWorkerError({
      message: 'Capture pipeline not initialized',
      code: 'NO_RENDERER'
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

  try {
    const frameToSend = captureFrame ?? await renderer.captureFrame();
    if (frameToSend === captureFrame) {
      captureFrame = null;
    }

    workerScope.postMessage(
      createWorkerResponse(WorkerResponseType.CAPTURE_READY, {
        bitmap: frameToSend
      }),
      [frameToSend]
    );
  } catch (error) {
    postWorkerError({
      message: `Failed to capture frame: ${getErrorMessage(error)}`,
      code: 'CAPTURE_FAILED'
    });
  }
}

async function handleRelease(): Promise<void> {
  clearCaptureState();
  if (renderer) {
    try {
      await renderer.release();
    } catch (error) {
      postWorkerError({
        message: getErrorMessage(error),
        code: 'RELEASE_FAILED'
      });
    } finally {
      renderer = null;
      isInitialized = false;
    }
  } else {
    isInitialized = false;
  }

  workerScope.postMessage(createWorkerResponse(WorkerResponseType.RELEASED));
}

async function handleDestroy(): Promise<void> {
  clearCaptureState();
  if (renderer) {
    try {
      await renderer.release();
    } catch (error) {
      postWorkerError({
        message: getErrorMessage(error),
        code: 'DESTROY_FAILED'
      });
    }
  }
  renderer = null;
  isInitialized = false;
  canvas = null;
  workerScope.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
  workerScope.close();
}
