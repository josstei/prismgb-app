import { PERFORMANCE_MEASUREMENT_CONTROLLER_SYMBOL } from '../main/infrastructure/diagnostics/performance-measurement-guard.js';
import type { PerformanceMeasurementController } from '../main/infrastructure/diagnostics/performance-measurement-guard.js';
import type { BrowserCapabilityProbeResult } from '../platform/gpu/domain/types.js';
import type { WebGpuBackendExecutionIdentity } from '../platform/gpu/domain/types.js';

export type PerformanceQualificationProbeBridge = (
  requestedLaunchId: string
) => Promise<BrowserCapabilityProbeResult>;

export type PerformanceControlProbeShutdownBoundary = Readonly<{
  readonly kind: 'shutdown-boundary';
  readonly boundary: 'before-release' | 'release-dispatched';
  readonly launchId: string;
  readonly observedAt: number;
}>;

export type PerformanceControlProbeSourceOpportunity = Readonly<{
  readonly kind: 'source-opportunity';
  readonly launchId: string;
  readonly sourceSequence: number;
  readonly observedAt: number;
  readonly mediaTime: number | null;
  readonly sessionPresent: boolean;
  readonly sessionActive: boolean;
  readonly duplicateMediaTime: boolean;
  readonly readyState: number;
  readonly hasCurrentData: boolean;
}>;

export type PerformanceControlProbeAdvisoryDisposition = Readonly<{
  readonly kind: 'advisory-frame-disposition';
  readonly launchId: string;
  readonly sourceSequence: number;
  readonly observedAt: number;
  readonly outcome:
    | 'canvas-draw-completed'
    | 'webgpu-queue-submit-completed'
    | 'skipped-inactive'
    | 'failed'
    | null;
  readonly frameToken: number | null;
}>;

export type PerformanceControlProbeFrameBranch =
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'session-branch';
    readonly observedAt: number;
    readonly workerPresent: boolean;
    readonly workerReady: boolean;
    readonly outstandingFrameCount: number;
    readonly outstandingFrameLimit: 2;
    readonly bitmapOutcome: 'created' | 'failed' | 'not-applicable';
    readonly canvasDrawOutcome:
      | 'canvas-draw-completed'
      | 'webgpu-queue-submit-completed'
      | 'skipped-inactive'
      | 'failed'
      | 'not-applicable';
    readonly framePostOutcome: 'posted' | 'not-applicable';
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'canvas-disposition';
    readonly outcome: 'canvas-draw-completed' | 'webgpu-queue-submit-completed' | 'skipped-inactive' | 'failed';
    readonly observedAt: number;
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'bitmap-creation';
    readonly outcome: 'created' | 'failed';
    readonly observedAt: number;
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'worker-frame-submitted';
    readonly frameToken: number;
    readonly observedAt: number;
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'worker-frame-acknowledged';
    readonly frameToken: number;
    readonly observedAt: number;
    readonly outcome: 'canvas-draw-completed' | 'webgpu-queue-submit-completed' | 'skipped-inactive' | 'failed';
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'worker-terminal-error';
    readonly frameToken: number;
    readonly observedAt: number;
  }>
  | Readonly<{
    readonly kind: 'frame-branch';
    readonly launchId: string;
    readonly sourceSequence: number;
    readonly branch: 'session-disposition';
    readonly observedAt: number;
    readonly disposition:
      | 'session-inactive'
      | 'worker-not-ready'
      | 'backpressure'
      | 'no-current-data'
      | 'bitmap-creation-failed'
      | 'enqueue-failed';
  }>;

export type PerformanceControlProbeMessage =
  | Readonly<{
    readonly kind: 'backend-ready';
    readonly launchId: string;
    readonly observedAt: number;
    readonly requestedBackend: 'canvas2d' | 'webgpu';
    readonly selectedBackend: 'canvas2d' | 'webgpu';
    readonly selectionReason:
      | 'requested-canvas2d'
      | 'performance-mode-canvas2d'
      | 'webgpu-api-unavailable'
      | 'webgpu-adapter-unavailable'
      | 'transfer-api-unavailable'
      | 'transfer-method-unavailable'
      | 'transfer-allowlisted-not-supported'
      | 'webgpu-selected'
      | 'fatal-detector-reason';
    readonly backendExecutionIdentity: WebGpuBackendExecutionIdentity | null;
  }>
  | PerformanceControlProbeShutdownBoundary
  | PerformanceControlProbeSourceOpportunity
  | PerformanceControlProbeAdvisoryDisposition
  | PerformanceControlProbeFrameBranch;

export type PerformanceControlProbe = Readonly<{
  write(message: PerformanceControlProbeMessage): void;
}>;

declare global {
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }

  const __PRISMGB_PERF_HARNESS__: boolean;
  const __PRISMGB_PERF_INSTRUMENTATION__: boolean;

  interface GlobalThis {
    [PERFORMANCE_MEASUREMENT_CONTROLLER_SYMBOL]?: PerformanceMeasurementController;
  }

  interface Window {
    __app?: () => unknown;
    webkitAudioContext?: typeof AudioContext;
    readonly prismgbPerformanceLaunchMarker?: Readonly<{
      readonly launchId: string;
    }>;
    readonly prismgbPerformanceControlProbe?: PerformanceControlProbe;
  }
}

export {};
