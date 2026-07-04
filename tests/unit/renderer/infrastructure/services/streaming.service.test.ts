/**
 * StreamingService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DeviceCatalog,
  getDeviceAcquisitionProfile,
  getDeviceStreamProfile
} from '@platform/devices';
import { StreamingService } from '@renderer/infrastructure/services/streaming/streaming.service';
import type { DeviceMediaAcquireResult } from '@renderer/infrastructure/services/streaming/device-media-acquirer.service';
import {
  createCaptureStreamMock,
  createDeviceInfo,
  createRendererDeviceRuntimeMock,
  createMediaTrackMock,
} from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';
import { createDeferred } from '../../../../support/deferred.testkit.js';

function createStreamingTarget(overrides = {}) {
  const descriptor = DeviceCatalog.default();
  const videoDevice = createDeviceInfo({ deviceId: 'device-1', label: 'Chromatic', kind: 'videoinput' });

  return {
    videoDevice,
    audioDevice: null,
    descriptor,
    profile: getDeviceStreamProfile(descriptor),
    acquisition: getDeviceAcquisitionProfile(descriptor),
    ...overrides
  };
}

describe('StreamingService', () => {
  let service;
  let mockEventBus;
  let mockRendererDeviceRuntime;
  let mockDeviceMediaAcquirer;
  let mockLogger;
  let mockTarget;

  beforeEach(() => {
    mockTarget = createStreamingTarget();

    const h = createInjectableHarness(StreamingService, {
      overrides: {
        rendererDeviceRuntime: createRendererDeviceRuntimeMock({
          resolveStreamingTarget: vi.fn().mockResolvedValue(mockTarget)
        })
      }
    });
    service = h.subject;
    mockLogger = h.logger;
    ({
      rendererDeviceRuntime: mockRendererDeviceRuntime,
      deviceMediaAcquirer: mockDeviceMediaAcquirer,
      eventBus: mockEventBus
    } = h.deps);
  });

  describe('Constructor', () => {
    it('should initialize with null stream', () => {
      expect(service.currentStream).toBeNull();
    });

    it('should initialize with null capabilities', () => {
      expect(service.currentCapabilities).toBeNull();
    });

    it('should initialize with isStreaming false', () => {
      expect(service.isStreaming).toBe(false);
    });
  });

  describe('start', () => {
    const mockVideoTrack = createMediaTrackMock({
      kind: 'video',
      label: 'Video',
      getSettings: vi.fn(() => ({ width: 160 })),
    });
    const mockStream = createCaptureStreamMock({
      id: 'stream-1',
      audioTracks: [],
      videoTracks: [mockVideoTrack]
    });
    const capabilities = {
      ...getDeviceStreamProfile(DeviceCatalog.default()),
      hasAudio: false
    };

    beforeEach(() => {
      mockDeviceMediaAcquirer.acquire.mockResolvedValue({
        stream: mockStream,
        strategy: 'full',
        capabilities
      });
    });

    it('should start streaming with a runtime-resolved target for a specific device ID', async () => {
      const result = await service.start('device-1');

      expect(mockRendererDeviceRuntime.resolveStreamingTarget).toHaveBeenCalledWith('device-1');
      expect(mockDeviceMediaAcquirer.acquire).toHaveBeenCalledWith(mockTarget);
      expect(result.stream).toBe(mockStream);
      expect(result.device).toBe(mockTarget.videoDevice);
      expect(service.isStreaming).toBe(true);
    });

    it('should resolve an automatic target when no ID is provided', async () => {
      const result = await service.start();

      expect(mockRendererDeviceRuntime.resolveStreamingTarget).toHaveBeenCalledWith(null);
      expect(result.device).toBe(mockTarget.videoDevice);
    });

    it('should reuse in-flight start work for concurrent start calls', async () => {
      const pendingAcquire = createDeferred<DeviceMediaAcquireResult>();
      mockDeviceMediaAcquirer.acquire.mockReturnValue(pendingAcquire.promise);

      const firstStart = service.start('device-1');
      const secondStart = service.start('device-1');

      await vi.waitFor(() => {
        expect(mockRendererDeviceRuntime.resolveStreamingTarget).toHaveBeenCalledTimes(1);
        expect(mockDeviceMediaAcquirer.acquire).toHaveBeenCalledTimes(1);
      });

      pendingAcquire.resolve({
        stream: mockStream,
        strategy: 'full',
        capabilities
      });

      await expect(firstStart).resolves.toMatchObject({ stream: mockStream });
      await expect(secondStart).resolves.toMatchObject({ stream: mockStream });
    });

    it('should stop existing stream before starting new one', async () => {
      service._state = 'streaming';
      service.currentStream = mockStream;

      await service.start('device-1');

      expect(mockDeviceMediaAcquirer.release).toHaveBeenCalledWith(mockStream);
      expect(mockDeviceMediaAcquirer.acquire).toHaveBeenCalledWith(mockTarget);
    });

    it('should wait for start to finish when stop is called while starting', async () => {
      const pendingAcquire = createDeferred<DeviceMediaAcquireResult>();
      mockDeviceMediaAcquirer.acquire.mockReturnValue(pendingAcquire.promise);

      const startPromise = service.start('device-1');
      const stopPromise = service.stop();

      pendingAcquire.resolve({
        stream: mockStream,
        strategy: 'full',
        capabilities
      });

      await expect(startPromise).resolves.toMatchObject({ stream: mockStream });
      await expect(stopPromise).resolves.toBeUndefined();
      expect(mockDeviceMediaAcquirer.release).toHaveBeenCalledWith(mockStream);
      expect(service.isStreaming).toBe(false);
    });

    it('should wait for stop to finish when start is called while stopping', async () => {
      const stopRelease = createDeferred();
      service._state = 'streaming';
      service.currentStream = mockStream;
      mockDeviceMediaAcquirer.release.mockReturnValueOnce(stopRelease.promise);

      const stopPromise = service.stop();
      const startPromise = service.start('device-1');

      expect(mockDeviceMediaAcquirer.acquire).not.toHaveBeenCalled();
      stopRelease.resolve();

      await expect(stopPromise).resolves.toBeUndefined();
      await expect(startPromise).resolves.toMatchObject({ stream: mockStream });
      expect(mockDeviceMediaAcquirer.acquire).toHaveBeenCalledWith(mockTarget);
    });

    it('should publish stream:started event with settings, capabilities, and strategy', async () => {
      await service.start('device-1');

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:started', {
        stream: mockStream,
        device: mockTarget.videoDevice,
        settings: {
          video: { width: 160 },
          audio: null,
          hasAudio: false
        },
        capabilities,
        strategy: 'full'
      });
    });

    it('should preserve null video settings in stream:started event payload', async () => {
      const audioSettings = { sampleRate: 48000 };
      const noVideoStream = createCaptureStreamMock({
        id: 'stream-audio-only',
        videoTracks: [],
        audioTracks: [createMediaTrackMock({ getSettings: vi.fn(() => audioSettings) })]
      });
      mockDeviceMediaAcquirer.acquire.mockResolvedValue({
        stream: noVideoStream,
        strategy: 'full',
        capabilities: { ...capabilities, hasAudio: true }
      });

      await service.start('device-1');

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:started', expect.objectContaining({
        settings: {
          video: null,
          audio: audioSettings,
          hasAudio: true
        }
      }));
    });

    it('should publish stream:error event when target resolution fails', async () => {
      const error = new Error('No supported device found');
      mockRendererDeviceRuntime.resolveStreamingTarget.mockRejectedValue(error);

      await expect(service.start()).rejects.toThrow('No supported device found');

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:error', {
        error,
        operation: 'start',
        deviceId: 'auto-select',
        message: 'No supported device found'
      });
    });

    it('should publish stream:error event when acquisition fails', async () => {
      const error = new Error('Stream failed');
      mockDeviceMediaAcquirer.acquire.mockRejectedValue(error);

      await expect(service.start('device-1')).rejects.toThrow();

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:error', {
        error,
        operation: 'start',
        deviceId: 'device-1',
        message: 'Stream failed'
      });
    });

    it('should publish fallback message for error objects with empty messages', async () => {
      const error = new Error('');
      mockDeviceMediaAcquirer.acquire.mockRejectedValue(error);

      await expect(service.start('device-1')).rejects.toThrow();

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:error', {
        error,
        operation: 'start',
        deviceId: 'device-1',
        message: 'Unknown error'
      });
    });
  });

  describe('stop', () => {
    const mockStream = createCaptureStreamMock({ id: 'stream-1' });

    beforeEach(() => {
      service._state = 'streaming';
      service.currentStream = mockStream;
      service.currentDevice = createDeviceInfo({ deviceId: 'device-1' });
    });

    it('should release stream via acquirer', async () => {
      await service.stop();

      expect(mockDeviceMediaAcquirer.release).toHaveBeenCalledWith(mockStream);
    });

    it('should clear all state', async () => {
      await service.stop();

      expect(service.currentStream).toBeNull();
      expect(service.currentDevice).toBeNull();
      expect(service.isStreaming).toBe(false);
    });

    it('should publish stream:stopped event', async () => {
      await service.stop();

      expect(mockEventBus.publish).toHaveBeenCalledWith('stream:stopped');
    });

    it('should do nothing if not streaming', async () => {
      service._state = 'idle';

      await service.stop();

      expect(mockDeviceMediaAcquirer.release).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith('Not streaming, nothing to stop');
    });
  });

  describe('getStream', () => {
    it('should return current stream', () => {
      const mockStream = createCaptureStreamMock({ id: 'stream-1' });
      service.currentStream = mockStream;

      expect(service.getStream()).toBe(mockStream);
    });

    it('should return null when no stream', () => {
      expect(service.getStream()).toBeNull();
    });
  });

  describe('isActive', () => {
    it('should return true when streaming', () => {
      service._state = 'streaming';
      expect(service.isActive()).toBe(true);
    });

    it('should return false when not streaming', () => {
      service._state = 'idle';
      expect(service.isActive()).toBe(false);
    });
  });

  describe('ERROR state recovery', () => {
    const mockVideoTrack = createMediaTrackMock({
      kind: 'video',
      label: 'Video',
      getSettings: vi.fn(() => ({ width: 160 })),
    });
    const mockStream = createCaptureStreamMock({
      id: 'stream-1',
      audioTracks: [],
      videoTracks: [mockVideoTrack]
    });
    const capabilities = {
      ...getDeviceStreamProfile(DeviceCatalog.default()),
      hasAudio: false
    };

    it('should clean up partial state when starting from ERROR state', async () => {
      service._state = 'error';
      service.currentStream = mockStream;
      service.currentDevice = mockTarget.videoDevice;
      mockDeviceMediaAcquirer.acquire.mockResolvedValue({
        stream: mockStream,
        strategy: 'full',
        capabilities
      });

      await service.start('device-1');

      expect(mockDeviceMediaAcquirer.release).toHaveBeenCalledWith(mockStream);
    });

    it('should allow restart after ERROR state', async () => {
      const error = new Error('First attempt failed');
      mockDeviceMediaAcquirer.acquire.mockRejectedValueOnce(error);

      await expect(service.start('device-1')).rejects.toThrow('First attempt failed');
      expect(service._state).toBe('error');

      mockDeviceMediaAcquirer.acquire.mockResolvedValue({
        stream: mockStream,
        strategy: 'full',
        capabilities
      });

      const result = await service.start('device-1');

      expect(result.stream).toBe(mockStream);
      expect(service.isActive()).toBe(true);
    });

    it('should clear partial state even if release fails during cleanup', async () => {
      service._state = 'error';
      service.currentStream = mockStream;
      service.currentDevice = mockTarget.videoDevice;
      mockDeviceMediaAcquirer.release.mockRejectedValueOnce(new Error('Release failed'));

      const newStream = createCaptureStreamMock({
        id: 'stream-2',
        audioTracks: [],
        videoTracks: [mockVideoTrack]
      });
      mockDeviceMediaAcquirer.acquire.mockResolvedValue({
        stream: newStream,
        strategy: 'full',
        capabilities
      });

      const result = await service.start('device-1');

      expect(mockDeviceMediaAcquirer.release).toHaveBeenCalledWith(mockStream);
      expect(result.stream).toBe(newStream);
    });
  });
});
