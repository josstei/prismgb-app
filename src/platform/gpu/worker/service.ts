import { resolvePreset } from '../application/catalog';
import { createGpuRenderer } from '../application/renderer.service';
import { detectWorkerGpuCapabilities } from '../infrastructure/capabilities.worker';
import type { RenderPipeline } from '../domain/types';
import { WorkerResponseType, createWorkerResponse, isValidWorkerMessage, type WorkerMessage, type WorkerErrorPayload } from './protocol';

export type WorkerRendererServiceScope = {
  onmessage: ((event: MessageEvent<unknown>) => void | Promise<void>) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

export function startWorkerRendererService(scope: WorkerRendererServiceScope): void {
  let renderer: RenderPipeline | null = null;
  let queue = Promise.resolve();
  let captureRequest: number | null = null;
  let frameCount = 0;
  let totalFrameTime = 0;
  let lastStatsTime = performance.now();
  const postError = (error: unknown, code: string, requestId?: number) => {
    const payload: WorkerErrorPayload = { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined, code, requestId };
    scope.postMessage(createWorkerResponse(WorkerResponseType.ERROR, payload));
  };

  async function handle(message: WorkerMessage): Promise<void> {
    switch (message.type) {
      case 'init': {
        if (renderer) throw new Error('Worker is already initialized');
        const { canvas, config } = message.payload;
        canvas.width = config.targetWidth;
        canvas.height = config.targetHeight;
        renderer = await createGpuRenderer({ canvas, nativeWidth: config.nativeWidth, nativeHeight: config.nativeHeight, preferredBackend: 'webgpu', capabilities: detectWorkerGpuCapabilities(canvas, 'webgpu'), allowCanvas2D: false, preset: resolvePreset(config.presetId) });
        scope.postMessage(createWorkerResponse(WorkerResponseType.READY, { backend: 'webgpu' }));
        return;
      }
      case 'frame': {
        const bitmap = message.payload.imageBitmap;
        try {
          if (!renderer) throw new Error('Renderer not initialized');
          const started = performance.now();
          renderer.renderFrame(bitmap);
          if (captureRequest !== null) {
            const requestId = captureRequest;
            captureRequest = null;
            let captured: ImageBitmap | null = null;
            try {
              captured = await renderer.captureFrame();
              scope.postMessage(createWorkerResponse(WorkerResponseType.CAPTURE_READY, { bitmap: captured, requestId }), [captured]);
              captured = null;
            } catch (error) {
              captured?.close();
              postError(error, 'CAPTURE_FAILED', requestId);
            }
          }
          frameCount++;
          totalFrameTime += performance.now() - started;
          const now = performance.now();
          if (now - lastStatsTime >= 1000) {
            const stats = renderer.getStats();
            scope.postMessage(createWorkerResponse(WorkerResponseType.STATS, { fps: frameCount, frameTime: Number((totalFrameTime / frameCount).toFixed(2)), gpuTime: stats.gpuTime }));
            frameCount = 0;
            totalFrameTime = 0;
            lastStatsTime = now;
          }
        } finally {
          bitmap.close();
          scope.postMessage(createWorkerResponse(WorkerResponseType.FRAME_RENDERED));
        }
        return;
      }
      case 'capture':
        if (!renderer) { postError(new Error('Renderer not initialized'), 'NO_RENDERER', message.payload.requestId); return; }
        captureRequest = message.payload.requestId;
        return;
      case 'resize': renderer?.resize(message.payload.width, message.payload.height); return;
      case 'setPreset': renderer?.setPreset(message.payload.preset); return;
      case 'setBrightness': renderer?.setBrightness(message.payload.brightness); return;
    }
  }
  scope.onmessage = (event) => {
    const message = event.data;
    if (!isValidWorkerMessage(message)) { postError(new Error('Invalid message format'), 'INVALID_MESSAGE'); return; }
    // Preserve wire order across async initialization and frame capture.
    queue = queue.then(() => handle(message)).catch((error) => postError(error, message.type === 'init' ? 'INIT_FAILED' : 'RENDER_FAILED'));
    return queue;
  };
}
