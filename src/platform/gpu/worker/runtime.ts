import * as Comlink from 'comlink';
import { resolvePreset } from '../application/catalog';
import { createGpuRenderer } from '../application/renderer.service';
import { detectWorkerGpuCapabilities } from '../infrastructure/capabilities.worker';
import type { FrameRenderResult, RenderCanvas, RenderPipeline, RenderPreset, RenderStats } from '../domain/types';
import {
  CONTROL_PORT_MESSAGE,
  WorkerResponseType,
  createWorkerResponse,
  isCanvasHandoffMessage,
  isFrameDispositionOutcome,
  isFrameMessage,
  isFrameToken,
  isPerformanceHarnessBuild,
  isWorkerRenderBackend,
  type FrameErrorResponse,
  type FramePayload,
  type PresetPayload,
  type ResizePayload,
  type WorkerCaptureReadyPayload,
  type WorkerControlApi,
  type WorkerReadyPayload,
  type WorkerRenderBackend,
  type WorkerRendererConfig
} from './protocol';

export type WorkerRendererServiceScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
  close(): void;
};

type WorkerRendererPipeline = {
  backend: WorkerRenderBackend;
  render: (source: TexImageSource) => FrameRenderResult;
  resize: (width: number, height: number) => void;
  captureFrame: () => Promise<ImageBitmap>;
  getStats: () => RenderStats & { uploadTime?: number };
  dispose: () => Promise<void>;
  setPreset: (preset: RenderPreset) => void;
  setBrightness: (value: number) => void;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createWorkerRendererPipeline(options: {
  canvas: RenderCanvas;
  backend?: WorkerRenderBackend;
  nativeSize: readonly [number, number];
  outputSize: readonly [number, number];
  preset?: RenderPreset;
}): Promise<WorkerRendererPipeline> {
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
    render: (source) => renderer.renderFrame(source),
    resize: (width, height) => renderer.resize(width, height),
    captureFrame: () => renderer.captureFrame(),
    getStats: () => renderer.getStats(),
    dispose: () => renderer.dispose(),
    setPreset: (preset) => renderer.setPreset(preset),
    setBrightness: (value) => renderer.setBrightness(value)
  };
}

export function startWorkerRendererService(workerScope: WorkerRendererServiceScope): void {
  let pipeline: WorkerRendererPipeline | null = null;
  let canvas: OffscreenCanvas | null = null;
  let config: WorkerRendererConfig | null = null;
  let isInitialized = false;
  let frameCount = 0;
  let totalFrameTime = 0;
  let lastStatsTime = performance.now();
  let captureRequested = false;
  let capturedFrame: ImageBitmap | null = null;
  let lastHarnessFrameToken = 0;

  let resolveCanvas: (value: OffscreenCanvas) => void;
  let canvasPromise = new Promise<OffscreenCanvas>((resolve) => {
    resolveCanvas = resolve;
  });

  function clearCaptureState(): void {
    captureRequested = false;
    if (capturedFrame) {
      capturedFrame.close();
      capturedFrame = null;
    }
  }

  const controlApi: WorkerControlApi = {
    async initialize(nextConfig: WorkerRendererConfig): Promise<WorkerReadyPayload> {
      const canvasToUse = canvas ?? (await canvasPromise);
      canvas = canvasToUse;
      config = nextConfig;

      if (pipeline) {
        await pipeline.dispose();
      }
      clearCaptureState();

      pipeline = await createWorkerRendererPipeline({
        canvas: canvasToUse,
        backend: nextConfig.backend,
        nativeSize: [nextConfig.nativeWidth, nextConfig.nativeHeight],
        outputSize: [nextConfig.targetWidth, nextConfig.targetHeight],
        preset: resolvePreset(nextConfig.presetId)
      });

      isInitialized = true;
      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = performance.now();
      lastHarnessFrameToken = 0;

      return { backend: pipeline.backend };
    },

    async resize(payload: ResizePayload): Promise<void> {
      if (!isInitialized || !pipeline) return;
      if (config) config.scaleFactor = payload.scaleFactor;
      pipeline.resize(payload.width, payload.height);
      if (canvas) {
        canvas.width = payload.width;
        canvas.height = payload.height;
      }
    },

    async setPreset(payload: PresetPayload): Promise<void> {
      if (!isInitialized || !pipeline) return;
      pipeline.setPreset(payload.preset);
    },

    async setBrightness(brightness: number): Promise<void> {
      if (!isInitialized || !pipeline) return;
      pipeline.setBrightness(brightness);
    },

    async requestCapture(): Promise<void> {
      if (!isInitialized || !pipeline) {
        throw new Error('Capture renderer not initialized');
      }
      captureRequested = true;
    },

    async getCapturedFrame(): Promise<WorkerCaptureReadyPayload> {
      if (!isInitialized || !pipeline || !canvas) {
        throw new Error('Capture renderer not initialized');
      }
      const bitmap = capturedFrame ?? (await pipeline.captureFrame());
      if (bitmap === capturedFrame) {
        capturedFrame = null;
      }
      return Comlink.transfer({ bitmap }, [bitmap as unknown as Transferable]);
    },

    async release(): Promise<void> {
      clearCaptureState();
      frameCount = 0;
      totalFrameTime = 0;
      lastStatsTime = performance.now();
      lastHarnessFrameToken = 0;
      if (pipeline) {
        await pipeline.dispose();
        pipeline = null;
      }
      isInitialized = false;
    },

    async destroy(): Promise<void> {
      clearCaptureState();
      if (pipeline) {
        await pipeline.dispose();
      }
      pipeline = null;
      isInitialized = false;
      canvas = null;
      frameCount = 0;
      totalFrameTime = 0;
      lastHarnessFrameToken = 0;
      workerScope.close();
    }
  };

  async function handleFrame(payload: FramePayload): Promise<void> {
    if (!isInitialized || !pipeline) return;

    const frameStart = performance.now();
    const { imageBitmap } = payload;
    try {
      const renderResult = pipeline.render(imageBitmap);

      if (captureRequested) {
        capturedFrame = await pipeline.captureFrame();
        captureRequested = false;
      }

      const frameTime = performance.now() - frameStart;
      frameCount++;
      totalFrameTime += frameTime;
      maybePostStats();

      if (isPerformanceHarnessBuild) {
        const frameToken = payload.frameToken;
        const outcome = renderResult?.outcome;
        if (!isFrameToken(frameToken) || !isFrameDispositionOutcome(outcome)) {
          throw new Error('Harness worker frame acknowledgement requires a valid token and pipeline outcome');
        }
        workerScope.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED, { frameToken, outcome }));
      } else {
        workerScope.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
      }
    } catch (error) {
      workerScope.postMessage({
        type: WorkerResponseType.ERROR,
        payload: {
          message: getErrorMessage(error),
          code: 'FRAME_RENDER_FAILED'
        },
        timestamp: performance.now()
      } satisfies FrameErrorResponse);
    } finally {
      imageBitmap?.close();
    }
  }

  function maybePostStats(): void {
    if (!pipeline) return;
    const now = performance.now();
    if (now - lastStatsTime < 1000) return;

    const stats = pipeline.getStats();
    const averageFrameTime = frameCount > 0 ? totalFrameTime / frameCount : stats.frameTime;
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

  function rejectHarnessFrameToken(payload: FramePayload): void {
    payload.imageBitmap.close();
    workerScope.postMessage({
      type: WorkerResponseType.ERROR,
      payload: {
        message: 'Worker frame token must be a new positive monotonic value',
        code: 'FRAME_TOKEN_REJECTED'
      },
      timestamp: performance.now()
    } satisfies FrameErrorResponse);
  }

  const controlChannel = new MessageChannel();
  Comlink.expose(controlApi, controlChannel.port1);
  workerScope.postMessage({ channel: CONTROL_PORT_MESSAGE, port: controlChannel.port2 }, [controlChannel.port2]);

  workerScope.onmessage = async (event) => {
    const message = event.data;
    if (isCanvasHandoffMessage(message)) {
      canvas = message.canvas;
      resolveCanvas(message.canvas);
      canvasPromise = Promise.resolve(message.canvas);
      return;
    }
    if (isFrameMessage(message)) {
      if (isPerformanceHarnessBuild) {
        const frameToken = message.payload.frameToken;
        if (!isFrameToken(frameToken) || frameToken <= lastHarnessFrameToken) {
          rejectHarnessFrameToken(message.payload);
          return;
        }
        lastHarnessFrameToken = frameToken;
      }
      await handleFrame(message.payload);
    }
  };
}
