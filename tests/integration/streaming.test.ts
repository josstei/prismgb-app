import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceCatalog, getDeviceAcquisitionProfile, getDeviceStreamProfile } from '@platform/devices';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { AppState } from '@renderer/application/state/app-state';
import { StreamingOrchestrator } from '@renderer/application/orchestrators/streaming.orchestrator';
import { BrowserMediaDevicesPort } from '@renderer/infrastructure/services/devices/browser-media-devices.port';
import { DeviceMediaAcquirer } from '@renderer/infrastructure/services/streaming/device-media-acquirer.service';
import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import { StreamingViewService } from '@renderer/infrastructure/services/streaming/streaming-view.service';
import { createManifestMediaEnvironment } from '../devices/media.testkit';
import { createLoggerFactory } from '../factories/logger.factory.js';
import { createDeferred } from '../support/deferred.testkit';

async function createStreamingFixture() {
  const media = createManifestMediaEnvironment({ connected: true }).install();
  const loggerFactory = createLoggerFactory();
  const eventBus = new PlatformEventBus({ loggerFactory });
  const descriptor = DeviceCatalog.default();
  const runtime = {
    isConnected: true,
    resolveStreamingTarget: async () => ({
      videoDevice: media.videoDevice,
      audioDevice: media.audioDevice,
      descriptor,
      profile: getDeviceStreamProfile(descriptor),
      acquisition: getDeviceAcquisitionProfile(descriptor)
    })
  };
  const acquirer = new DeviceMediaAcquirer({
    mediaDevicesPort: new BrowserMediaDevicesPort(navigator.mediaDevices), loggerFactory
  });
  const streaming = new StreamingService({ rendererDeviceRuntime: runtime, deviceMediaAcquirer: acquirer, eventBus, loggerFactory });
  const appState = new AppState({ streamingService: streaming, rendererDeviceRuntime: runtime });
  const video = document.createElement('video');
  // Happy DOM only accepts its own MediaStream class; acquisition uses the
  // browser-port stream double so track lifecycle remains controllable here.
  Object.defineProperty(video, 'srcObject', { value: null, writable: true });
  const elements = { streamVideo: video, streamCanvas: document.createElement('canvas') };
  const view = new StreamingViewService({ uiController: {
    elements, setStreamCanvas: (canvas) => { elements.streamCanvas = canvas; }
  }, loggerFactory });
  const rendering = {
    initialize: vi.fn(), handlePerformanceStateChanged: vi.fn(), handleFullscreenChange: vi.fn(),
    handleRenderPresetChanged: vi.fn(), handlePerformanceModeChanged: vi.fn(async () => {}),
    startPipeline: vi.fn(async () => {}), stopPipeline: vi.fn(async () => {}), cleanup: vi.fn(async () => {})
  };
  const recording = { isActive: vi.fn(() => false), stop: vi.fn(async () => {}) };
  const orchestrator = new StreamingOrchestrator({
    streamingService: streaming, appState, streamViewService: view, streamingRenderService: rendering,
    gpuRecordingService: recording, settingsService: { getSetting: () => false }, eventBus, loggerFactory
  });
  const subscriptions: Array<() => void> = [];
  await orchestrator.initialize();
  return { media, eventBus, streaming, appState, video, rendering, recording, subscriptions, orchestrator,
    async dispose() {
      await streaming.dispose();
      await orchestrator.dispose();
      await view.dispose();
      await acquirer.dispose();
      subscriptions.forEach((unsubscribe) => unsubscribe());
      media.cleanup();
      expect(eventBus.emitter.eventNames()).toEqual([]);
    }
  };
}

describe('streaming service and orchestrator integration', () => {
  let fixture: Awaited<ReturnType<typeof createStreamingFixture>>;
  beforeEach(async () => { fixture = await createStreamingFixture(); });
  afterEach(async () => { await fixture.dispose(); });

  it('quits during a pending native permission request and closes a later granted stream', async () => {
    const media = navigator.mediaDevices;
    const late = await media.getUserMedia({ video: { deviceId: { exact: fixture.media.videoDevice.deviceId } }, audio: false });
    const permission = Promise.withResolvers<MediaStream>();
    const getUserMedia = vi.spyOn(media, 'getUserMedia').mockReturnValueOnce(permission.promise);
    const errorFeedback = vi.fn();
    fixture.subscriptions.push(fixture.eventBus.subscribe(EventChannels.UI.OVERLAY_ERROR, errorFeedback));
    const starting = fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await fixture.orchestrator.dispose();
    await starting;
    permission.resolve(late);
    await vi.waitFor(() => expect(late.getTracks().every((track) => track.readyState === 'ended')).toBe(true));
    expect(fixture.appState.isStreaming).toBe(false);
    expect(fixture.video.srcObject).toBeNull();
    expect(fixture.rendering.startPipeline).not.toHaveBeenCalled();
    expect(errorFeedback).not.toHaveBeenCalled();
  });

  it('routes UI requests through acquisition, paired audio, DOM attachment and render startup', async () => {
    const modeChanged = vi.fn();
    fixture.subscriptions.push(fixture.eventBus.subscribe(EventChannels.UI.STREAMING_MODE, modeChanged));

    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);

    const stream = fixture.streaming.getStream()!;
    expect(fixture.appState.isStreaming).toBe(true);
    expect(fixture.appState.currentStream).toBe(stream);
    expect(fixture.video.srcObject).toBe(stream);
    expect(fixture.video.muted).toBe(true);
    expect(stream.getAudioTracks()).toHaveLength(1);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({
      audio: expect.objectContaining({ deviceId: { exact: fixture.media.audioDevice.deviceId } }),
      video: expect.objectContaining({ deviceId: { exact: fixture.media.videoDevice.deviceId } })
    }));
    expect(fixture.rendering.startPipeline).toHaveBeenCalledWith(expect.objectContaining({
      nativeResolution: { width: 160, height: 144 }, hasAudio: true
    }));
    expect(modeChanged).toHaveBeenCalledWith({ enabled: true });

    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_STOP_REQUESTED);
    expect(fixture.appState.isStreaming).toBe(false);
    expect(fixture.video.srcObject).toBeNull();
    expect(stream.getTracks().every((track) => track.readyState === 'ended')).toBe(true);
    expect(modeChanged).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('keeps stop pending until recording drains before releasing rendering and the video', async () => {
    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);
    const drain = createDeferred();
    fixture.recording.isActive.mockReturnValue(true);
    fixture.recording.stop.mockReturnValue(drain.promise);
    const settled = vi.fn();

    const stopping = fixture.eventBus.publishAsync(EventChannels.UI.STREAM_STOP_REQUESTED).then(settled);
    try {
      await vi.waitFor(() => expect(fixture.recording.stop).toHaveBeenCalledOnce());
      expect(settled).not.toHaveBeenCalled();
      expect(fixture.rendering.stopPipeline).not.toHaveBeenCalled();
      expect(fixture.video.srcObject).not.toBeNull();
    } finally {
      drain.resolve();
      await stopping;
    }
    expect(fixture.rendering.stopPipeline).toHaveBeenCalledOnce();
    expect(fixture.video.srcObject).toBeNull();
    expect(settled).toHaveBeenCalledOnce();
  });

  it('propagates an ended video track to stream cleanup and UI error feedback', async () => {
    const errorFeedback = vi.fn();
    fixture.subscriptions.push(fixture.eventBus.subscribe(EventChannels.UI.OVERLAY_ERROR, errorFeedback));
    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);
    const stream = fixture.streaming.getStream()!;
    const stopped = createDeferred();
    fixture.subscriptions.push(fixture.eventBus.subscribe<{ enabled: boolean }>(EventChannels.UI.STREAMING_MODE, ({ enabled }) => {
      if (!enabled) stopped.resolve();
    }));

    stream.getVideoTracks()[0].dispatchEvent(new Event('ended'));

    await stopped.promise;
    expect(fixture.streaming.isActive()).toBe(false);
    expect(fixture.video.srcObject).toBeNull();
    expect(fixture.rendering.stopPipeline).toHaveBeenCalledOnce();
    expect(errorFeedback).toHaveBeenCalledWith({ message: 'Device disconnected or powered off' });
  });

  it('reports acquisition failure through the real event chain and supports a fresh retry', async () => {
    const errorFeedback = vi.fn();
    fixture.subscriptions.push(fixture.eventBus.subscribe(EventChannels.UI.OVERLAY_ERROR, errorFeedback));
    fixture.media.disconnect();

    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);
    expect(fixture.appState.isStreaming).toBe(false);
    expect(fixture.video.srcObject).toBeNull();
    expect(fixture.rendering.startPipeline).not.toHaveBeenCalled();
    expect(errorFeedback).toHaveBeenCalledWith({ message: expect.stringContaining('Stream acquisition failed') });

    fixture.media.connect();
    await fixture.eventBus.publishAsync(EventChannels.UI.STREAM_START_REQUESTED);
    expect(fixture.appState.isStreaming).toBe(true);
    expect(fixture.video.srcObject).toBe(fixture.streaming.getStream());
  });
});
