import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingRenderService } from '@renderer/infrastructure/services/streaming/streaming-render.service';
import type { SettingsAccess } from '@renderer/lib/settings.definitions';
import { createEventBus } from '../../../../../factories/event-bus.factory.js';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
const { createSession, detect } = vi.hoisted(() => ({ createSession: vi.fn(), detect: vi.fn() }));
vi.mock('@platform/gpu/runtime', () => ({ createGpuVideoRendererSession: createSession, detectBrowserGpuCapabilities: detect }));
const capabilities = { webgpu: true, transferControlToOffscreen: true };
function session(backend = 'webgpu') {
  return { backend, isActive: true, isCanvasTransferred: backend === 'webgpu', renderFrame: vi.fn(async () => {}), resize: vi.fn(), setPreset: vi.fn(), setBrightness: vi.fn(), captureFrame: vi.fn(), getTargetDimensions: vi.fn(() => ({ width: 640, height: 576 })), terminate: vi.fn() };
}
function fixture() {
  const appState = { isStreaming: true };
  const video = document.createElement('video');
  video.requestVideoFrameCallback = vi.fn(() => 1);
  video.cancelVideoFrameCallback = vi.fn();
  let canvas = document.createElement('canvas');
  const lifecycle = { initialize: vi.fn(), handleFullscreenChange: vi.fn(), setupCanvasSize: vi.fn(), recreateCanvas: vi.fn(async () => { canvas = document.createElement('canvas'); }), cleanup: vi.fn() };
  const eventBus = createEventBus();
  const settings = { getSetting: vi.fn((key: string) => key === 'globalBrightness' ? 1.2 : 'pixel') as SettingsAccess['getSetting'] };
  const service = new StreamingRenderService({ appState, streamViewService: { getVideo: () => video, getCanvas: () => canvas }, canvasLifecycleService: lifecycle, settingsService: settings, eventBus, loggerFactory: createLoggerFactory() });
  service.initialize();
  const begin = async () => {
    const started = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    await vi.waitFor(() => expect(video.requestVideoFrameCallback).toHaveBeenCalled());
    vi.mocked(video.requestVideoFrameCallback).mock.calls.at(-1)![0](0, {} as VideoFrameCallbackMetadata);
    await started;
  };
  return { service, appState, video, lifecycle, eventBus, begin, canvas: () => canvas };
}
beforeEach(() => { detect.mockResolvedValue(capabilities); createSession.mockImplementation(async (options) => session(options.backend)); });
afterEach(() => { vi.useRealTimers(); });
describe('renderer session ownership', () => {
  it('starts after stream health and uses detected GPU capabilities', async () => {
    const { service, begin, video } = fixture();
    await begin();
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ backend: 'webgpu', presetId: 'pixel', brightness: 1.2 }));
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    expect(service.isActive()).toBe(true);
    await service.cleanup();
  });
  it('uses Canvas2D when GPU unavailable and recreates canvas before restarting', async () => {
    detect.mockResolvedValueOnce({ ...capabilities, webgpu: false });
    const { service, begin, lifecycle } = fixture();
    await begin();
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ backend: 'canvas2d' }));
    expect(service.isActive()).toBe(true);
    await service.stopPipeline();
    expect(lifecycle.recreateCanvas).toHaveBeenCalledTimes(1);
    expect(service.isActive()).toBe(false);
  });
  it('retries failed transferred-canvas initialization with a fresh Canvas2D canvas', async () => {
    createSession.mockRejectedValueOnce(new Error('worker init failed'));
    const { service, begin, lifecycle, canvas, video } = fixture();
    const original = canvas();
    await begin();
    expect(lifecycle.recreateCanvas).toHaveBeenCalledTimes(1);
    expect(createSession.mock.calls[0][0].canvas).toBe(original);
    expect(createSession.mock.calls[1][0].canvas).not.toBe(original);
    expect(createSession.mock.calls[1][0].backend).toBe('canvas2d');
    expect(service.isActive()).toBe(true);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    await service.cleanup();
  });
  it('preserves desired preset and brightness across performance transitions', async () => {
    const { service, begin } = fixture();
    await begin();
    await service.handlePerformanceModeChanged(true);
    expect(createSession.mock.calls.at(-1)![0].backend).toBe('canvas2d');
    service.handleRenderPresetChanged('vintage');
    await service.handlePerformanceModeChanged(false);
    expect(createSession.mock.calls.at(-1)![0]).toMatchObject({ backend: 'webgpu', presetId: 'vintage', brightness: 1.2 });
    await service.cleanup();
  });
  it('discards superseded backend switches', async () => {
    const { service, begin } = fixture();
    await begin();
    const enabled = service.handlePerformanceModeChanged(true);
    const disabled = service.handlePerformanceModeChanged(false);
    await Promise.all([enabled, disabled]);
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession.mock.calls.at(-1)![0].backend).toBe('webgpu');
    await service.cleanup();
  });
  it('stops pending health checks without reporting stale startup success', async () => {
    const { service, video } = fixture();
    const started = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const rejected = expect(started).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(video.requestVideoFrameCallback).toHaveBeenCalled());
    await service.stopPipeline();
    await rejected;
    expect(createSession).not.toHaveBeenCalled();
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(1);
  });
  it('terminates a session which finishes initialization after stop', async () => {
    const pending = Promise.withResolvers<ReturnType<typeof session>>();
    createSession.mockReturnValueOnce(pending.promise);
    const { service, video } = fixture();
    const started = service.startPipeline({ nativeResolution: { width: 160, height: 144 } });
    const rejected = expect(started).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(video.requestVideoFrameCallback).toHaveBeenCalled());
    vi.mocked(video.requestVideoFrameCallback).mock.calls[0][0](0, {} as VideoFrameCallbackMetadata);
    await vi.waitFor(() => expect(createSession).toHaveBeenCalled());
    const stopped = service.stopPipeline();
    const obsolete = session();
    pending.resolve(obsolete);
    await stopped;
    await rejected;
    expect(obsolete.terminate).toHaveBeenCalledTimes(1);
    expect(service.isActive()).toBe(false);
  });
  it('resumes exactly one loop after visibility changes', async () => {
    const { service, begin, video } = fixture();
    await begin();
    service.handlePerformanceStateChanged({ hidden: true });
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledTimes(2);
    service.handlePerformanceStateChanged({ hidden: false });
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(3);
    await service.cleanup();
  });
});
