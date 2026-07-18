import { resolvePreset } from '../application/catalog';
import { createGpuRenderer } from '../application/renderer.service';
import { detectWorkerGpuCapabilities } from '../infrastructure/capabilities.worker';
import type { RenderCanvas, RenderPipeline, RenderPreset, RenderStats } from '../domain/types';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerResponse,
  isValidWorkerMessage,
  isWorkerRenderBackend,
  type FramePayload,
  type InitPayload,
  type PresetPayload,
  type ResizePayload,
  type WorkerErrorPayload,
  type WorkerRenderBackend,
  type WorkerRendererConfig
} from './protocol';

export type WorkerRendererServiceScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

type WorkerRendererPipelineOptions = {
  canvas: RenderCanvas;
  backend?: WorkerRenderBackend;
  nativeSize: readonly [number, number];
  outputSize: readonly [number, number];
  preset?: RenderPreset;
};

type WorkerRendererPipeline = {
  backend: WorkerRenderBackend;
  render: (source: TexImageSource) => void;
  resize: (width: number, height: number) => void;
  captureFrame: () => Promise<ImageBitmap>;
  getStats: () => RenderStats;
  dispose: () => Promise<void>;
  setPreset: (preset: RenderPreset) => void;
  setBrightness: (value: number) => void;
};

type WorkerRenderer = {
  config: WorkerRendererConfig;
  pipeline: WorkerRendererPipeline;
  render(imageBitmap: ImageBitmap): void;
  setPreset(preset: RenderPreset): void;
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

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createWorkerRendererPipeline(
  options: WorkerRendererPipelineOptions
): Promise<WorkerRendererPipeline> {
  const [nativeWidth, nativeHeight] = options.nativeSize;
  const [outputWidth, outputHeight] = options.outputSize;

  options.canvas.width = outputWidth;
  options.canvas.height = outputHeight;

  const renderer = await createGpuRenderer({
    canvas: options.canvas,
    nativeWidth,
    nativeHeight,
    preferredBackend: options.backend,
    capabilities: detectWorkerGpuCapabilities(options.canvas, options.backend),
    allowCanvas2D: false,
    preset: options.preset
  }) as RenderPipeline;

  if (!isWorkerRenderBackend(renderer.backend)) {
    throw new Error(`Worker renderer resolved unsupported backend '${renderer.backend}'`);
  }

  return {
    backend: renderer.backend,
    render: (source: TexImageSource): void => {
      renderer.renderFrame(source);
    },
    resize: (width: number, height: number): void => {
      renderer.resize(width, height);
    },
    captureFrame: async (): Promise<ImageBitmap> => {
      return renderer.captureFrame();
    },
    getStats: (): RenderStats => {
      return renderer.getStats();
    },
    dispose: async (): Promise<void> => {
      await renderer.dispose();
    },
    setPreset: (preset: RenderPreset): void => {
      renderer.setPreset(preset);
    },
    setBrightness: (value: number): void => {
      renderer.setBrightness(value);
    }
  };
}

export function startWorkerRendererService(workerScope: WorkerRendererServiceScope): void {
  let renderer: WorkerRenderer | null = null;
  let canvas: OffscreenCanvas | null = null;
  let isInitialized = false;
  let frameCount = 0;
  let totalFrameTime = 0;
  let lastStatsTime = performance.now();
  let captureRequested = false;
  let captureFrame: ImageBitmap | null = null;
  let activePreset: RenderPreset | null = null;

  function postWorkerError(payload: WorkerErrorPayload): void {
    workerScope.postMessage(createWorkerResponse(WorkerResponseType.ERROR, payload));
  }

  async function createRenderer(
    canvasToUse: OffscreenCanvas,
    config: WorkerRendererConfig,
    preset: RenderPreset
  ): Promise<WorkerRenderer> {
    const pipeline = await createWorkerRendererPipeline({
      canvas: canvasToUse,
      backend: config.backend,
      nativeSize: [config.nativeWidth, config.nativeHeight],
      outputSize: [config.targetWidth, config.targetHeight],
      preset
    });

    const workerRenderer: WorkerRenderer = {
      config,
      pipeline,
      render: (imageBitmap) => {
        workerRenderer.pipeline.render(imageBitmap);
      },
      setPreset: (nextPreset) => {
        activePreset = nextPreset;
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

      const preset = resolvePreset(config.presetId);

      const nextRenderer = await createRenderer(canvasToUse, config, preset);
      activePreset = preset;
      renderer = nextRenderer;

      isInitialized = true;
      captureRequested = false;
      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = performance.now();

      workerScope.postMessage(createWorkerResponse(WorkerResponseType.READY, {
        backend: nextRenderer.pipeline.backend
      }));
    } catch (error) {
      postWorkerError({
        message: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
        code: 'INIT_FAILED'
      });
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

    const frameStart = performance.now();
    const { imageBitmap } = payload;
    try {
      renderer.render(imageBitmap);

      if (captureRequested) {
        captureFrame = await renderer.captureFrame();
        captureRequested = false;
      }

      const frameTime = performance.now() - frameStart;
      frameCount++;
      totalFrameTime += frameTime;
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
    const averageFrameTime = frameCount > 0
      ? totalFrameTime / frameCount
      : stats.frameTime;
    workerScope.postMessage(createWorkerResponse(WorkerResponseType.STATS, {
      fps: frameCount,
      frameTime: Number(averageFrameTime.toFixed(2)),
      gpuTime: stats.gpuTime,
      uploadTime: stats.uploadTime
    }));
    frameCount = 0;
    totalFrameTime = 0;
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

  function handleSetBrightness(payload: { brightness: number }): void {
    if (!isInitialized || !renderer) return;

    try {
      renderer.pipeline.setBrightness(payload.brightness);
    } catch (error) {
      postWorkerError({
        message: getErrorMessage(error),
        code: 'BRIGHTNESS_UPDATE_FAILED'
      });
    }
  }

  function handleRequestCapture(): void {
    if (!isInitialized || !renderer) {
      postWorkerError({
        message: 'Capture renderer not initialized',
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
        message: 'Capture renderer not initialized',
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
    frameCount = 0;
    totalFrameTime = 0;
    lastStatsTime = performance.now();
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
    frameCount = 0;
    totalFrameTime = 0;
    workerScope.postMessage(createWorkerResponse(WorkerResponseType.DESTROYED));
    workerScope.close();
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
      case WorkerMessageType.SET_BRIGHTNESS:
        handleSetBrightness(payload);
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
}
