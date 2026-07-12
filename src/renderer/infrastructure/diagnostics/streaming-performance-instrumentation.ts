import { createPerformanceDiagnostics } from './performance-diagnostics.js';
import { EventChannels } from '@platform/events';
import type { TypedEventBusLike } from '@platform/events';
import type {
  PerformanceBackendSelectionReason,
  PerformanceDiagnostics,
  PerformanceDiagnosticsSnapshot,
  PerformanceSourceDisposition,
  PerformanceTimingMetricId,
  PerformanceTimingOutcome
} from './performance-diagnostics.js';
import type {
  GpuVideoFrameMeasurementContext,
  GpuVideoPerformanceObservation
} from '@platform/gpu/runtime';

type GpuBackend = 'webgpu' | 'canvas2d';

export type StreamingPerformanceInstrumentation = {
  beginSourceOpportunity(sourceSequence: number): GpuVideoFrameMeasurementContext;
  recordSource(context: GpuVideoFrameMeasurementContext, disposition: PerformanceSourceDisposition): void;
  recordSourceCallback(context: GpuVideoFrameMeasurementContext, startedAt: number, endedAt: number): void;
  recordBackend(
    requestedBackend: GpuBackend,
    observedBackend: GpuBackend,
    selectionReason: PerformanceBackendSelectionReason
  ): void;
  observe(observation: GpuVideoPerformanceObservation): void;
  reset(): void;
  getSnapshot(): PerformanceDiagnosticsSnapshot;
  dispose(): void;
};

export function createStreamingPerformanceInstrumentation(
  launchId: string,
  logger: Pick<Console, 'error'>,
  eventBus: TypedEventBusLike
): StreamingPerformanceInstrumentation {
  return new RendererPerformanceInstrumentation(launchId, logger, eventBus);
}

class RendererPerformanceInstrumentation implements StreamingPerformanceInstrumentation {
  private readonly diagnostics: PerformanceDiagnostics;
  private sourceSequence = 0;
  private readonly unsubscribers: Array<() => void>;

  constructor(
    private readonly launchId: string,
    private readonly logger: Pick<Console, 'error'>,
    eventBus: TypedEventBusLike
  ) {
    this.diagnostics = createPerformanceDiagnostics();
    this.recordStartupHeap();
    this.unsubscribers = [
      eventBus.subscribe(
      EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED,
      (payload) => {
        const boundary = payload.diagnosticBoundary;
        if (boundary?.kind !== 'performance-shutdown-boundary' || boundary.launchId !== this.launchId) {
          return;
        }
        const result = this.diagnostics.recordShutdownBoundary({
          launchId: boundary.launchId,
          boundary: boundary.boundary
        });
        if (result.accepted === false) {
          this.logger.error(`Performance shutdown boundary rejected: ${result.reason}`);
        }
      }
      ),
      eventBus.subscribe(EventChannels.RENDER.PIPELINE_READY, (payload) => {
        if (payload.backend !== 'canvas2d' && payload.backend !== 'webgpu') {
          this.logger.error('Performance pipeline-ready event used an unsupported backend');
          return;
        }
        const result = this.diagnostics.recordPipelineReady({ backend: payload.backend });
        if (result.accepted === false) {
          this.logger.error(`Performance pipeline-ready event rejected: ${result.reason}`);
        }
      }),
      eventBus.subscribe(EventChannels.RENDER.PIPELINE_ERROR, (payload) => {
        const result = this.diagnostics.recordPipelineError({
          message: payload.message,
          code: payload.code ?? null
        });
        if (result.accepted === false) {
          this.logger.error(`Performance pipeline-error event rejected: ${result.reason}`);
        }
      }),
      eventBus.subscribe(EventChannels.RENDER.STATS_UPDATE, (payload) => {
        const result = this.diagnostics.recordRenderStats({
          fps: typeof payload.fps === 'number' ? payload.fps : null,
          frameTime: typeof payload.frameTime === 'number' ? payload.frameTime : null,
          gpuTime: typeof payload.gpuTime === 'number' ? payload.gpuTime : null,
          uploadTime: typeof payload.uploadTime === 'number' ? payload.uploadTime : null
        });
        if (result.accepted === false) {
          this.logger.error(`Performance render-stats event rejected: ${result.reason}`);
        }
      })
    ];
  }

  beginSourceOpportunity(sourceSequence: number): GpuVideoFrameMeasurementContext {
    if (!Number.isSafeInteger(sourceSequence) || sourceSequence <= this.sourceSequence) {
      throw new Error('Performance source sequence must be positive and strictly monotonic');
    }
    this.sourceSequence = sourceSequence;
    return {
      sourceSequence,
      measurementEpochId: this.launchId
    };
  }

  recordSource(
    context: GpuVideoFrameMeasurementContext,
    disposition: PerformanceSourceDisposition
  ): void {
    const result = this.diagnostics.recordSourceOpportunity({
      sourceSequence: context.sourceSequence,
      disposition
    });
    if (result.accepted === false) {
      this.logger.error(`Performance source observation rejected: ${result.reason}`);
    }
  }

  recordSourceCallback(
    context: GpuVideoFrameMeasurementContext,
    startedAt: number,
    endedAt: number
  ): void {
    this.recordTiming(
      context,
      'source-callback',
      'source-callback-observed',
      startedAt,
      endedAt
    );
  }

  recordBackend(
    requestedBackend: GpuBackend,
    observedBackend: GpuBackend,
    selectionReason: PerformanceBackendSelectionReason
  ): void {
    const result = this.diagnostics.recordBackendObservation({
      requestedBackend,
      selectedBackend: observedBackend,
      observedBackend,
      observedBackendUnavailableReason: null,
      selectionReason,
      fallbackReason: requestedBackend === observedBackend ? null : selectionReason
    });
    if (result.accepted === false) {
      this.logger.error(`Performance backend observation rejected: ${result.reason}`);
    }
  }

  observe(observation: GpuVideoPerformanceObservation): void {
    switch (observation.kind) {
      case 'canvas-disposition': {
        const disposition: PerformanceSourceDisposition = observation.outcome === 'canvas-draw-completed'
          ? 'drawCompleted'
          : observation.outcome === 'skipped-inactive'
            ? 'driverInactive'
            : 'driverFailed';
        this.recordSource(observation.context, disposition);
        if (observation.outcome === 'canvas-draw-completed') {
          this.recordTiming(
            observation.context,
            'canvas-draw-call',
            'canvas-draw-completed',
            observation.startedAt,
            observation.endedAt
          );
        }
        return;
      }
      case 'worker-frame-submitted':
        this.recordSource(observation.context, 'workerFrameSubmitted');
        return;
      case 'worker-frame-timing':
        this.recordTiming(
          observation.context,
          'webgpu-worker-render',
          'webgpu-worker-rendered',
          observation.workerRender.startedAt,
          observation.workerRender.endedAt,
          observation.frameToken,
          'worker-performance-now-v1'
        );
        this.recordTiming(
          observation.context,
          'webgpu-worker-queue-submit',
          'webgpu-queue-submit-completed',
          observation.queueSubmit.startedAt,
          observation.queueSubmit.endedAt,
          observation.frameToken,
          'worker-performance-now-v1'
        );
        return;
      case 'worker-frame-acknowledged': {
        const outcome = observation.outcome === 'webgpu-queue-submit-completed'
          ? 'queueSubmitCompleted'
          : observation.outcome === 'skipped-inactive'
            ? 'driverInactive'
            : 'driverFailed';
        const result = this.diagnostics.recordWorkerAcknowledgement({ outcome });
        if (result.accepted === false) {
          this.logger.error(`Performance worker acknowledgement rejected: ${result.reason}`);
        }
        return;
      }
      case 'worker-terminal-error':
        this.diagnostics.recordWorkerTerminalError();
        return;
      case 'bitmap-creation': {
        this.recordTiming(
          observation.context,
          'webgpu-bitmap-creation',
          'bitmap-created',
          observation.startedAt,
          observation.endedAt
        );
        const byteValue = observation.sourceWidth * observation.sourceHeight * 4;
        if (
          Number.isSafeInteger(observation.sourceWidth) && observation.sourceWidth > 0 &&
          Number.isSafeInteger(observation.sourceHeight) && observation.sourceHeight > 0 &&
          Number.isSafeInteger(byteValue)
        ) {
          const result = this.diagnostics.recordWebGpuAllocationRequestProxy({
            backend: 'webgpu',
            carrier: 'frame-request',
            measurementEpochId: observation.context.measurementEpochId,
            sourceSequence: observation.context.sourceSequence,
            operationId: 'video-frame-image-bitmap-request',
            sourceLocationId: 'video-session:create-image-bitmap',
            requestOrdinal: observation.context.sourceSequence,
            outcome: 'success',
            byteKind: 'rgba-transfer-footprint',
            byteValue,
            sourceWidth: observation.sourceWidth,
            sourceHeight: observation.sourceHeight
          });
          if (result.accepted === false) {
            this.logger.error(`Performance allocation observation rejected: ${result.reason}`);
          }
        }
        return;
      }
      case 'session-disposition': {
        let disposition: PerformanceSourceDisposition;
        switch (observation.disposition) {
          case 'session-inactive':
            disposition = 'sessionInactive';
            break;
          case 'worker-not-ready':
            disposition = 'workerNotReady';
            break;
          case 'backpressure':
            disposition = 'backpressure';
            break;
          case 'no-current-data':
            disposition = 'noCurrentData';
            break;
          case 'bitmap-creation-failed':
            disposition = 'bitmapCreationFailed';
            break;
          case 'enqueue-failed':
            disposition = 'enqueueFailed';
            break;
        }
        this.recordSource(observation.context, disposition);
      }
    }
  }

  reset(): void {
    this.diagnostics.reset({ lastSourceSequence: this.sourceSequence });
  }

  getSnapshot(): PerformanceDiagnosticsSnapshot {
    return this.diagnostics.getSnapshot();
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe();
    }
  }

  private recordStartupHeap(): void {
    const memory = (performance as Performance & {
      memory?: { readonly usedJSHeapSize?: unknown };
    }).memory;
    const usedJsHeapSize = memory?.usedJSHeapSize;
    if (Number.isSafeInteger(usedJsHeapSize) && (usedJsHeapSize as number) >= 0) {
      this.diagnostics.recordRendererHeapObservation({
        observationId: `startup-${this.launchId}`,
        observedAt: performance.now(),
        usedBytes: usedJsHeapSize as number
      });
      return;
    }

    this.diagnostics.recordRendererHeapUnavailable('performance-memory-unavailable');
  }

  private recordTiming(
    context: GpuVideoFrameMeasurementContext,
    metricId: PerformanceTimingMetricId,
    outcome: PerformanceTimingOutcome,
    startedAt: number,
    endedAt: number,
    frameToken: number | null = null,
    clock: 'renderer-performance-now-v1' | 'worker-performance-now-v1' | 'external-monotonic-v1' = 'renderer-performance-now-v1'
  ): void {
    const result = this.diagnostics.recordTimingSample({
      measurementEpochId: context.measurementEpochId,
      sourceSequence: context.sourceSequence,
      firstSourceSequence: context.sourceSequence,
      lastSourceSequence: context.sourceSequence,
      frameToken,
      metricId,
      unit: 'milliseconds',
      clock,
      outcome,
      startedAt,
      endedAt
    });
    if (result.accepted === false) {
      this.logger.error(`Performance timing observation rejected: ${result.reason}`);
    }
  }
}
