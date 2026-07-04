import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingRenderService } from '@renderer/infrastructure/services/streaming/streaming-render.service';
import { createGpuVideoRendererSession, detectBrowserGpuCapabilities } from '@platform/gpu/runtime';
import { createStreamingViewServiceMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

const mockSession = {
  backend: 'webgpu',
  isActive: true,
  isCanvasTransferred: true,
  renderFrame: vi.fn(async () => {}),
  resize: vi.fn(),
  setPreset: vi.fn(),
  setBrightness: vi.fn(),
  captureFrame: vi.fn(async () => ({ width: 160, height: 144 } as any)),
  release: vi.fn(),
  terminate: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('@platform/gpu/runtime', () => ({
  createGpuVideoRendererSession: vi.fn(async () => mockSession),
  detectBrowserGpuCapabilities: vi.fn(async () => ({
    webgpu: true,
    offscreenCanvas: true,
    transferControlToOffscreen: true,
    preferredBackend: 'webgpu',
    maxTextureSize: 4096
  }))
}));

describe('StreamingRenderService', () => {
  let service: StreamingRenderService;
  let mockAppState: any;
  let mockStreamViewService: any;
  let mockCanvasLifecycleService: any;
  let mockStreamHealthService: any;
  let mockSettingsService: any;
  let mockEventBus: any;
  let mockLogger: any;
  let canvas: HTMLCanvasElement;
  let video: HTMLVideoElement;

  beforeEach(() => {
    const section = document.createElement('section');
    const container = document.createElement('div');
    canvas = document.createElement('canvas');
    video = document.createElement('video');

    container.appendChild(canvas);
    section.appendChild(container);
    document.body.appendChild(section);

    const h = createInjectableHarness(StreamingRenderService, {
      overrides: {
        streamViewService: createStreamingViewServiceMock({
          getCanvas: vi.fn(() => canvas),
          getVideo: vi.fn(() => video),
          getCanvasContainer: vi.fn(() => container),
          getCanvasSection: vi.fn(() => section),
          setCanvas: vi.fn()
        }),
        settingsService: {
          getNumberSetting: vi.fn((name) => {
            if (name === 'globalBrightness') return 1.0;
            return null;
          }),
          getStringSetting: vi.fn((name) => {
            if (name === 'renderPreset') return 'vibrant';
            return null;
          })
        }
      }
    });
    service = h.subject;
    mockLogger = h.logger;
    ({
      appState: mockAppState,
      streamViewService: mockStreamViewService,
      canvasLifecycleService: mockCanvasLifecycleService,
      streamHealthService: mockStreamHealthService,
      settingsService: mockSettingsService,
      eventBus: mockEventBus
    } = h.deps);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('initializes canvas lifecycle service', () => {
      service.initialize();
      expect(mockCanvasLifecycleService.initialize).toHaveBeenCalled();
    });
  });

  describe('startPipeline', () => {
    it('starts rendering after stream health check', async () => {
      mockAppState.setStreaming(true);

      const startPromise = service.startPipeline({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        nativeResolution: { width: 160, height: 144 }
      });

      // trigger stream health check callback
      const onHealthyCallback = mockStreamHealthService.checkStreamHealth.mock.calls[0][1];
      onHealthyCallback({});

      await startPromise;

      expect(mockStreamHealthService.checkStreamHealth).toHaveBeenCalled();
      expect(mockSession.terminate).not.toHaveBeenCalled();
    });
  });

  describe('stopPipeline', () => {
    it('terminates active session and cleans up resources', async () => {
      mockAppState.setStreaming(true);

      const startPromise = service.startPipeline({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        nativeResolution: { width: 160, height: 144 }
      });

      const onHealthyCallback = mockStreamHealthService.checkStreamHealth.mock.calls[0][1];
      onHealthyCallback({});
      await startPromise;

      service.stopPipeline();

      expect(mockSession.terminate).toHaveBeenCalled();
    });
  });

  describe('visibility pause/resume (regression: black screen after fullscreen round-trip)', () => {
    async function startStreaming() {
      (video as any).requestVideoFrameCallback = vi.fn();
      (video as any).cancelVideoFrameCallback = vi.fn();
      mockAppState.setStreaming(true);

      const startPromise = service.startPipeline({
        webgpu: true,
        offscreenCanvas: true,
        transferControlToOffscreen: true,
        nativeResolution: { width: 160, height: 144 }
      });
      const onHealthyCallback = mockStreamHealthService.checkStreamHealth.mock.calls[0][1];
      onHealthyCallback({});
      await startPromise;
    }

    it('resumes the render loop when the window becomes visible after being hidden', async () => {
      await startStreaming();

      const scheduleFrame = (video as any).requestVideoFrameCallback as ReturnType<typeof vi.fn>;
      expect(scheduleFrame).toHaveBeenCalled();

      service.handlePerformanceStateChanged({ hidden: true });
      const scheduledWhileHidden = scheduleFrame.mock.calls.length;

      service.handlePerformanceStateChanged({ hidden: false });

      expect(scheduleFrame.mock.calls.length).toBeGreaterThan(scheduledWhileHidden);
    });
  });

  describe('backend selection (regression: GPU capability detection wiring)', () => {
    async function startWith(streamCapabilities: Record<string, unknown>) {
      mockAppState.setStreaming(true);
      const startPromise = service.startPipeline({
        nativeResolution: { width: 160, height: 144 },
        ...streamCapabilities
      });
      const onHealthyCallback = mockStreamHealthService.checkStreamHealth.mock.calls[0][1];
      onHealthyCallback({});
      await startPromise;
    }

    it('detects GPU capabilities and selects WebGPU when available, ignoring the (unset) stream capabilities', async () => {
      // The device stream capabilities never carry webgpu; the fix must DETECT it.
      await startWith({ webgpu: false, offscreenCanvas: false, transferControlToOffscreen: false });

      expect(detectBrowserGpuCapabilities).toHaveBeenCalled();
      expect(createGpuVideoRendererSession).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredBackend: 'webgpu',
          capabilities: expect.objectContaining({ webgpu: true })
        })
      );
    });

    it('falls back to Canvas2D when detection reports WebGPU unavailable', async () => {
      vi.mocked(detectBrowserGpuCapabilities).mockResolvedValueOnce({
        webgpu: false,
        offscreenCanvas: false,
        transferControlToOffscreen: false,
        preferredBackend: 'canvas2d',
        maxTextureSize: 4096
      });

      await startWith({ webgpu: true });

      expect(createGpuVideoRendererSession).toHaveBeenCalledWith(
        expect.objectContaining({
          preferredBackend: 'canvas2d',
          capabilities: expect.objectContaining({ webgpu: false })
        })
      );
    });
  });
});
