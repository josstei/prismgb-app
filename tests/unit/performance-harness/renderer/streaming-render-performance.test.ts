import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingRenderService } from '../../../../src/renderer/infrastructure/services/streaming/streaming-render.service';
import { createStreamingViewServiceMock } from '../../../factories/index.js';
import { createInjectableHarness } from '../../../support/di/injectable.harness.js';
import type { GpuVideoRendererSessionOptions } from '../../../../src/platform/gpu/application/video-session';

const { mockCreateSession, mockDetectCapabilities } = vi.hoisted(() => ({
  mockCreateSession: vi.fn(),
  mockDetectCapabilities: vi.fn()
}));

vi.mock('@platform/gpu/runtime', () => ({
  createGpuVideoRendererSession: mockCreateSession,
  detectBrowserGpuCapabilities: mockDetectCapabilities
}));

describe('instrumented StreamingRenderService', () => {
  let service: StreamingRenderService;
  let appState: { setStreaming: (value: boolean) => void };
  let streamHealthService: { checkStreamHealth: ReturnType<typeof vi.fn> };
  let video: HTMLVideoElement;
  let sessionOptions: GpuVideoRendererSessionOptions;
  let sessionTerminate: ReturnType<typeof vi.fn>;
  let eventBus: { _getEventsOfType: (event: string) => Array<{ data: unknown }> };
  let originalLocation: string;

  beforeEach(() => {
    originalLocation = window.location.href;
    window.history.replaceState(null, '', '/?prismgb-e2e-diagnostics=1');
    Object.defineProperty(window, 'prismgbPerformanceLaunchMarker', {
      configurable: true,
      value: Object.freeze({ launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192' })
    });
    mockDetectCapabilities.mockResolvedValue({
      webgpu: true,
      offscreenCanvas: true,
      transferControlToOffscreen: true,
      preferredBackend: 'webgpu',
      maxTextureSize: 4096
    });

    const canvas = document.createElement('canvas');
    video = document.createElement('video');
    Object.defineProperties(video, {
      readyState: { value: 4 },
      HAVE_CURRENT_DATA: { value: 2 }
    });
    Object.defineProperty(video, 'requestVideoFrameCallback', {
      value: vi.fn()
    });

    mockCreateSession.mockImplementation(async (options: GpuVideoRendererSessionOptions) => {
      sessionOptions = options;
      sessionTerminate = vi.fn();
      options.onReady?.({ backend: 'canvas2d' });
      return {
        backend: 'canvas2d',
        isActive: true,
        isCanvasTransferred: false,
        renderFrame: async (_video: HTMLVideoElement, measurement) => {
          if (!measurement) throw new Error('missing measurement context');
          options.onHarnessObservation?.({
            kind: 'canvas-disposition',
            context: measurement,
            outcome: 'canvas-draw-completed'
          });
          options.onPerformanceObservation?.({
            kind: 'canvas-disposition',
            context: measurement,
            outcome: 'canvas-draw-completed',
            startedAt: 1,
            endedAt: 2
          });
          return { outcome: 'canvas-draw-completed' as const };
        },
        resize: vi.fn(),
        setPreset: vi.fn(),
        setBrightness: vi.fn(),
        getTargetDimensions: () => ({ width: 160, height: 144 }),
        captureFrame: vi.fn(),
        release: vi.fn(),
        terminate: sessionTerminate,
        dispose: vi.fn()
      };
    });

    const harness = createInjectableHarness(StreamingRenderService, {
      overrides: {
        streamViewService: createStreamingViewServiceMock({
          getCanvas: vi.fn(() => canvas),
          getVideo: vi.fn(() => video)
        })
      }
    });
    service = harness.subject;
    ({ appState, streamHealthService, eventBus } = harness.deps as typeof harness.deps & {
      appState: { setStreaming: (value: boolean) => void };
      streamHealthService: { checkStreamHealth: ReturnType<typeof vi.fn> };
      eventBus: { _getEventsOfType: (event: string) => Array<{ data: unknown }> };
    });
  });

  afterEach(async () => {
    await service.cleanup();
    mockCreateSession.mockReset();
    mockDetectCapabilities.mockReset();
    window.history.replaceState(null, '', originalLocation);
    delete (window as Window & { prismgbPerformanceLaunchMarker?: unknown }).prismgbPerformanceLaunchMarker;
    delete (window as Window & { prismgbPerformanceControlProbe?: unknown }).prismgbPerformanceControlProbe;
    document.body.innerHTML = '';
  });

  it('records a source opportunity and raw Canvas span through the marker-gated diagnostics path', async () => {
    const write = vi.fn();
    Object.defineProperty(window, 'prismgbPerformanceControlProbe', {
      configurable: true,
      value: Object.freeze({ write })
    });
    appState.setStreaming(true);
    const start = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const onHealthy = streamHealthService.checkStreamHealth.mock.calls[0][1];
    onHealthy({});
    await start;

    const requestVideoFrameCallback = (video as HTMLVideoElement & {
      requestVideoFrameCallback: ReturnType<typeof vi.fn>;
    }).requestVideoFrameCallback;
    const callback = requestVideoFrameCallback.mock.calls[0][0] as (now: number, metadata: { mediaTime: number }) => Promise<void>;
    await callback(1, { mediaTime: 1 });

    const diagnostics = service.getPerformanceDiagnosticsSnapshot();
    expect(sessionOptions.onPerformanceObservation).toBeTypeOf('function');
    expect(diagnostics).toMatchObject({
      backend: { availability: 'observed', observedBackend: 'canvas2d' },
      source: {
        sourceOpportunities: 1,
        canvas: { attempts: 1, drawCompleted: 1 },
        reconciliation: { isConserved: true }
      }
    });
    expect(diagnostics?.timingSamples['source-callback']).toHaveLength(1);
    expect(diagnostics?.timingSamples['canvas-draw-call']).toHaveLength(1);
    expect(write).toHaveBeenNthCalledWith(1, {
      kind: 'source-opportunity',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      mediaTime: 1,
      sessionPresent: true,
      sessionActive: true,
      duplicateMediaTime: false,
      readyState: 4,
      hasCurrentData: true
    });
    expect(write).toHaveBeenNthCalledWith(2, {
      kind: 'frame-branch',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      branch: 'canvas-disposition',
      outcome: 'canvas-draw-completed'
    });
    expect(write).toHaveBeenNthCalledWith(3, {
      kind: 'advisory-frame-disposition',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      outcome: 'canvas-draw-completed',
      frameToken: null
    });

    expect(service.resetPerformanceDiagnostics()).toBe(true);
    expect(service.getPerformanceDiagnosticsSnapshot()).toMatchObject({
      source: {
        sourceOpportunities: 0,
        reconciliation: { accountedOpportunities: 0, isConserved: true }
      }
    });
    expect(service.getPerformanceDiagnosticsSnapshot()?.timingSamples['source-callback']).toEqual([]);

    const nextCallback = requestVideoFrameCallback.mock.calls[1][0] as (now: number, metadata: { mediaTime: number }) => Promise<void>;
    await nextCallback(2, { mediaTime: 2 });

    expect(service.getPerformanceDiagnosticsSnapshot()).toMatchObject({
      source: {
        sourceOpportunities: 1,
        reconciliation: { accountedOpportunities: 1, isConserved: true }
      }
    });
    expect(service.getPerformanceDiagnosticsSnapshot()?.timingSamples['source-callback']).toMatchObject([
      { sourceSequence: 2 }
    ]);
  });

  it('does not create diagnostics without the explicit runtime marker', async () => {
    window.history.replaceState(null, '', '/');
    appState.setStreaming(true);
    const start = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const onHealthy = streamHealthService.checkStreamHealth.mock.calls[0][1];
    onHealthy({});
    await start;

    expect(service.getPerformanceDiagnosticsSnapshot()).toBeNull();
  });

  it('records a missing session as an ordered source opportunity before the render-loop guard', async () => {
    const write = vi.fn();
    Object.defineProperty(window, 'prismgbPerformanceControlProbe', {
      configurable: true,
      value: Object.freeze({ write })
    });
    appState.setStreaming(true);
    const start = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const onHealthy = streamHealthService.checkStreamHealth.mock.calls[0][1];
    onHealthy({});
    await start;

    const requestVideoFrameCallback = (video as HTMLVideoElement & {
      requestVideoFrameCallback: ReturnType<typeof vi.fn>;
    }).requestVideoFrameCallback;
    const callback = requestVideoFrameCallback.mock.calls[0][0] as (now: number, metadata: { mediaTime: number }) => Promise<void>;
    (service as unknown as { _session: unknown })._session = null;
    await callback(1, { mediaTime: 1 });

    expect(write).toHaveBeenNthCalledWith(1, {
      kind: 'source-opportunity',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      mediaTime: 1,
      sessionPresent: false,
      sessionActive: false,
      duplicateMediaTime: false,
      readyState: 4,
      hasCurrentData: true
    });
    expect(write).toHaveBeenNthCalledWith(2, {
      kind: 'frame-branch',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      branch: 'session-disposition',
      disposition: 'session-inactive'
    });
    expect(write).toHaveBeenNthCalledWith(3, {
      kind: 'advisory-frame-disposition',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192',
      sourceSequence: 1,
      outcome: 'skipped-inactive',
      frameToken: null
    });
    expect(service.getPerformanceDiagnosticsSnapshot()).toMatchObject({
      source: {
        sourceOpportunities: 1,
        fatalDispositions: { sessionInactive: 1, total: 1 },
        reconciliation: { isConserved: true }
      }
    });
    expect(service.getPerformanceDiagnosticsSnapshot()?.timingSamples['source-callback']).toHaveLength(1);
  });

  it('writes ordered release boundaries without scheduling legacy snapshots', async () => {
    const write = vi.fn();
    Object.defineProperty(window, 'prismgbPerformanceControlProbe', {
      configurable: true,
      value: Object.freeze({ write })
    });

    appState.setStreaming(true);
    const start = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const onHealthy = streamHealthService.checkStreamHealth.mock.calls[0][1];
    onHealthy({});
    await start;

    service.stopPipeline();

    expect(write).toHaveBeenNthCalledWith(1, {
      kind: 'shutdown-boundary',
      boundary: 'before-release',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
    });
    expect(write).toHaveBeenNthCalledWith(2, {
      kind: 'shutdown-boundary',
      boundary: 'release-dispatched',
      launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
    });
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(sessionTerminate.mock.invocationCallOrder[0]);
    expect(sessionTerminate.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[1]);
    expect(eventBus._getEventsOfType('performance:memory-snapshot-requested')).toEqual([
      expect.objectContaining({
        data: {
          diagnosticBoundary: {
            kind: 'performance-shutdown-boundary',
            boundary: 'before-release',
            launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
          }
        }
      }),
      expect.objectContaining({
        data: {
          diagnosticBoundary: {
            kind: 'performance-shutdown-boundary',
            boundary: 'release-dispatched',
            launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
          }
        }
      })
    ]);
    expect(service.getPerformanceDiagnosticsSnapshot()?.shutdown).toEqual({
      beforeRelease: {
        availability: 'observed',
        unavailableReason: null,
        launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
      },
      releaseDispatched: {
        availability: 'observed',
        unavailableReason: null,
        launchId: '6e3cc1a1-c341-4e20-9737-56ac2c4bd192'
      }
    });
  });
});
