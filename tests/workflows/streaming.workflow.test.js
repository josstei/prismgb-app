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
  MockDeviceManager,
} from '../factories/index.js';
import { EventChannels } from '@prismgb/events';

describe('Streaming Workflow Integration', () => {
  let eventBus;
  let appState;
  let deviceManager;
  let device;

  beforeEach(() => {
    eventBus = createEventBus();
    appState = createAppState();
    deviceManager = new MockDeviceManager().setupMediaDevicesMock();
    device = MockDeviceManager.createChromatic();
  });

  afterEach(() => {
    deviceManager.reset();
    eventBus._reset();
    vi.clearAllMocks();
  });

  it('should enumerate the manifest-backed Chromatic media device when connected', async () => {
    deviceManager.addDevice(device);

    const devices = await navigator.mediaDevices.enumerateDevices();

    expect(devices).toContainEqual(expect.objectContaining({
      deviceId: device.deviceInfo.deviceId,
      kind: 'videoinput',
      label: device.deviceInfo.label,
    }));
  });

  it('should acquire a stream through the media device harness', async () => {
    const events = [];
    deviceManager.addDevice(device);
    eventBus.subscribe(EventChannels.STREAM.STARTED, ({ stream }) => {
      events.push(`stream:${stream.getVideoTracks().length}`);
    });

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: device.deviceInfo.deviceId } },
    });
    eventBus.publish(EventChannels.STREAM.STARTED, { stream });
    appState.setStreaming(true);

    expect(stream.getVideoTracks()).toHaveLength(1);
    expect(appState.isStreaming).toBe(true);
    expect(events).toContain('stream:1');
  });

  it('should reject media acquisition after device disconnect', async () => {
    deviceManager.addDevice(device);
    device.disconnect();

    await expect(navigator.mediaDevices.getUserMedia({ video: true }))
      .rejects.toThrow('Requested device not found');
  });

  it('should publish disconnect interruption while streaming', async () => {
    const events = [];
    deviceManager.addDevice(device);
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    appState.setStreaming(true);
    appState.setDeviceConnected(true);

    eventBus.subscribe(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION, () => {
      events.push('session-interrupted');
    });

    device.disconnect();
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
