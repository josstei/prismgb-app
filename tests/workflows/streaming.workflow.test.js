/**
 * Streaming workflow integration tests.
 *
 * These tests exercise the manifest-backed media harness instead of preserving
 * a separate device lifecycle state machine.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createAppState,
  createEventBus,
  createStreamingService,
  StreamingState,
} from '../factories/index.js';
import { createManifestMediaEnvironment } from '../devices/media.testkit.ts';
import { EventChannels } from '@prismgb/events';

describe('Streaming Workflow Integration', () => {
  let eventBus;
  let appState;
  let mediaEnvironment;

  beforeEach(() => {
    eventBus = createEventBus();
    appState = createAppState();
    mediaEnvironment = createManifestMediaEnvironment({ connected: true }).install();
  });

  afterEach(() => {
    mediaEnvironment.cleanup();
    eventBus._reset();
    vi.clearAllMocks();
  });

  it('should enumerate the manifest-backed Chromatic media device when connected', async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();

    expect(devices).toContainEqual(expect.objectContaining({
      deviceId: mediaEnvironment.videoDevice.deviceId,
      kind: 'videoinput',
      label: mediaEnvironment.videoDevice.label,
    }));
  });

  it('should acquire a stream through the media device harness', async () => {
    const events = [];
    eventBus.subscribe(EventChannels.STREAM.STARTED, ({ stream }) => {
      events.push(`stream:${stream.getVideoTracks().length}`);
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: mediaEnvironment.videoDevice.deviceId } },
    });
    eventBus.publish(EventChannels.STREAM.STARTED, { stream });
    appState.setStreaming(true);

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(appState.isStreaming).toBe(true);
    expect(events).toContain('stream:1');
  });

  it('should reject media acquisition after device disconnect', async () => {
    mediaEnvironment.disconnect();

    await expect(navigator.mediaDevices.getUserMedia({ video: true }))
      .rejects.toThrow('Requested device not found');
  });

  it('should publish disconnect interruption while streaming', async () => {
    const events = [];
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    appState.setStreaming(true);
    appState.setDeviceConnected(true);

    eventBus.subscribe(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION, () => {
      events.push('session-interrupted');
    });

    mediaEnvironment.disconnect();
    eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
    appState.setStreaming(false);
    appState.setDeviceConnected(false);

    expect(stream.getVideoTracks()[0].stop).toHaveBeenCalled();
    expect(appState.isStreaming).toBe(false);
    expect(events).toContain('session-interrupted');
  });
});

describe('Streaming Service Integration', () => {
  let streamingService;

  beforeEach(() => {
    streamingService = createStreamingService();
  });

  it('should track streaming state correctly', async () => {
    expect(streamingService._getState()).toBe(StreamingState.IDLE);

    await streamingService.start('device-1');
    expect(streamingService._getState()).toBe(StreamingState.STREAMING);
    expect(streamingService.isActive()).toBe(true);

    await streamingService.stop();
    expect(streamingService._getState()).toBe(StreamingState.IDLE);
    expect(streamingService.isActive()).toBe(false);
  });

  it('should prevent starting when already streaming', async () => {
    await streamingService.start('device-1');

    await expect(streamingService.start('device-2')).rejects.toThrow('Already streaming');
  });
});
