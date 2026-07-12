import * as Comlink from 'comlink';
import { resolvePreset } from '../application/catalog';
import { createGpuRenderer } from '../application/renderer.service';
import { detectWorkerGpuCapabilities } from '../infrastructure/capabilities.worker';
import type {
  FrameRenderResult,
  RenderCanvas,
  RenderPipeline,
  RenderPreset,
  RenderStats,
  WebGpuFrameInstrumentationObserver,
  WebGpuFrameRequestProxy,
  WebGpuLifecycleInstrumentationObserver,
  WebGpuLifecycleRequestProxy
} from '../domain/types';
import {
  CONTROL_PORT_MESSAGE,
  WorkerResponseType,
  createWorkerPerformanceFrameTimingResponse,
  createWorkerResponse,
  isCanvasHandoffMessage,
  isFrameDispositionOutcome,
  isFrameMessage,
  isFrameToken,
  isInstrumentedFramePayload,
  isPerformanceHarnessBuild,
  isWorkerRenderBackend,
  type FrameErrorResponse,
  type FramePayload,
  type PresetPayload,
  type ResizePayload,
  type WorkerCaptureReadyPayload,
  type WorkerControlApi,
  type WorkerLifecycleRequestPayload,
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
  startupLifecycleRequestProxies?: readonly WebGpuLifecycleRequestProxy[];
  render: (source: TexImageSource, instrumentationObserver?: WebGpuFrameInstrumentationObserver) => FrameRenderResult;
  resize: (width: number, height: number) => readonly WebGpuLifecycleRequestProxy[] | undefined;
  captureFrame: () => Promise<ImageBitmap>;
  getStats: () => RenderStats & { uploadTime?: number };
  dispose: () => Promise<void>;
  setPreset: (preset: RenderPreset) => void;
  setBrightness: (value: number) => void;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isPerformanceInstrumentationBuild(): boolean {
  return (
    typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
    __PRISMGB_PERF_HARNESS__ &&
    typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
    __PRISMGB_PERF_INSTRUMENTATION__
  );
}

function cloneLifecycleRequestProxy(request: WebGpuLifecycleRequestProxy): WebGpuLifecycleRequestProxy {
  return 'textureDescriptor' in request
    ? { ...request, textureDescriptor: { ...request.textureDescriptor } }
    : { ...request };
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

  const startupLifecycleRequestProxies: WebGpuLifecycleRequestProxy[] = [];
  const lifecycleInstrumentationObserver: WebGpuLifecycleInstrumentationObserver | undefined =
    isPerformanceInstrumentationBuild()
      ? {
        recordWebGpuLifecycleRequestProxy(request): void {
          startupLifecycleRequestProxies.push(cloneLifecycleRequestProxy(request));
        }
      }
      : undefined;

  const renderer = await createGpuRenderer({
    canvas: options.canvas,
    nativeWidth,
    nativeHeight,
    preferredBackend: options.backend,
    capabilities: detectWorkerGpuCapabilities(options.canvas, options.backend),
    allowCanvas2D: false,
    preset: options.preset,
    lifecycleInstrumentationObserver
  }) as RenderPipeline;

  if (!isWorkerRenderBackend(renderer.backend)) {
    throw new Error(`Worker renderer resolved unsupported backend '${renderer.backend}'`);
  }

  return {
    backend: renderer.backend,
    ...(lifecycleInstrumentationObserver === undefined
      ? {}
      : { startupLifecycleRequestProxies }),
    render: (source, instrumentationObserver) => instrumentationObserver === undefined
      ? renderer.renderFrame(source)
      : renderer.renderFrame(source, instrumentationObserver),
    resize: (width, height) => {
      if (!isPerformanceInstrumentationBuild()) {
        renderer.resize(width, height);
        return undefined;
      }

      const lifecycleRequestProxies: WebGpuLifecycleRequestProxy[] = [];
      renderer.resize(width, height, {
        recordWebGpuLifecycleRequestProxy(request): void {
          lifecycleRequestProxies.push(cloneLifecycleRequestProxy(request));
        }
      });
      return lifecycleRequestProxies;
    },
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

      if (isPerformanceInstrumentationBuild()) {
        return {
          backend: pipeline.backend,
          lifecycleRequestProxies: pipeline.startupLifecycleRequestProxies ?? []
        };
      }
      return { backend: pipeline.backend };
    },

    async resize(payload: ResizePayload): Promise<WorkerLifecycleRequestPayload | undefined> {
      if (!isInitialized || !pipeline) return;
      if (config) config.scaleFactor = payload.scaleFactor;
      const lifecycleRequestProxies = pipeline.resize(payload.width, payload.height);
      if (canvas) {
        canvas.width = payload.width;
        canvas.height = payload.height;
      }
      if (isPerformanceInstrumentationBuild() && lifecycleRequestProxies !== undefined) {
        return { lifecycleRequestProxies };
      }
      return undefined;
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
      let hasDiagnosticFrame = false;
      let diagnosticFrameId: number | null = null;
      let queueSubmitTiming: { startedAt: number; endedAt: number } | null = null;
      const frameRequestProxies: WebGpuFrameRequestProxy[] = [];
      let workerRenderStartedAt = 0;
      let workerRenderEndedAt = 0;
      let renderResult: FrameRenderResult;
      if (
        typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
        __PRISMGB_PERF_HARNESS__ &&
        typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
        __PRISMGB_PERF_INSTRUMENTATION__ &&
        isInstrumentedFramePayload(payload)
      ) {
        hasDiagnosticFrame = true;
        diagnosticFrameId = payload.diagnosticFrameId;
        workerRenderStartedAt = performance.now();
        renderResult = pipeline.render(imageBitmap, {
          recordWebGpuQueueSubmitTiming(startedAt, endedAt): void {
            if (queueSubmitTiming !== null) {
              throw new Error('Instrumented worker frame emitted more than one queue-submit span');
            }
            queueSubmitTiming = { startedAt, endedAt };
          },
          recordWebGpuFrameRequestProxy(request): void {
            if (frameRequestProxies.some((existing) => (
              existing.operationId === request.operationId &&
              existing.sourceLocationId === request.sourceLocationId
            ))) {
              throw new Error('Instrumented worker frame emitted a duplicate request proxy');
            }
            frameRequestProxies.push({ ...request });
          }
        });
        workerRenderEndedAt = performance.now();
      } else {
        renderResult = pipeline.render(imageBitmap);
      }

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
        if (
          typeof __PRISMGB_PERF_HARNESS__ !== 'undefined' &&
          __PRISMGB_PERF_HARNESS__ &&
          typeof __PRISMGB_PERF_INSTRUMENTATION__ !== 'undefined' &&
          __PRISMGB_PERF_INSTRUMENTATION__ &&
          hasDiagnosticFrame
        ) {
          if (outcome !== 'webgpu-queue-submit-completed' || queueSubmitTiming === null || diagnosticFrameId === null) {
            throw new Error('Instrumented worker frame requires one queue-submit span before acknowledgement');
          }
          workerScope.postMessage(createWorkerPerformanceFrameTimingResponse({
            frameToken,
            diagnosticFrameId,
            outcome,
            workerRender: {
              startedAt: workerRenderStartedAt,
              endedAt: workerRenderEndedAt
            },
            queueSubmit: queueSubmitTiming,
            frameRequestProxies
          }));
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
