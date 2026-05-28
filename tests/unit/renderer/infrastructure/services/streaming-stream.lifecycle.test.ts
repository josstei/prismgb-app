// @ts-nocheck
/**
 * BaseStreamLifecycle Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseStreamLifecycle } from '@renderer/infrastructure/streaming/acquisition/stream-lifecycle.base.ts';
import { createMediaServiceMock, createMediaStreamMock, createMediaTrackMock, createLogger } from '../../../../factories/index.js';
import { installMediaMocks } from '../../../../support/mocks/browser-api.installers.js';

describe('BaseStreamLifecycle', () => {
  let lifecycle;
  let mockLogger;
  let mediaMock;

  function createLifecycleStream({
    id = 'stream-id',
    active = true,
    tracks = []
  } = {}) {
    return {
      id,
      active,
      ...createMediaStreamMock({ tracks })
    };
  }

  beforeEach(() => {
    mockLogger = createLogger();
    mediaMock = installMediaMocks({
      getSupportedConstraints: () => ({ width: true, height: true })
    });
    lifecycle = new BaseStreamLifecycle(mockLogger);
  });

  afterEach(() => {
    mediaMock.cleanup();
  });

  describe('Constructor', () => {
    it('should create lifecycle with logger', () => {
      expect(lifecycle.logger).toBe(mockLogger);
    });

    it('should initialize empty activeStreams set', () => {
      expect(lifecycle.activeStreams).toBeInstanceOf(Set);
      expect(lifecycle.activeStreams.size).toBe(0);
    });

    it('should create lifecycle without logger', () => {
      const noLoggerLifecycle = new BaseStreamLifecycle();
      expect(noLoggerLifecycle.logger).toBeNull();
    });

    it('should accept optional mediaService parameter', () => {
      const mockMediaService = createMediaServiceMock();
      const lifecycleWithService = new BaseStreamLifecycle(mockLogger, mockMediaService);
      expect(lifecycleWithService.mediaService).toBe(mockMediaService);
    });

    it('should default mediaService to null when not provided', () => {
      expect(lifecycle.mediaService).toBeNull();
    });
  });

  describe('acquireStream', () => {
    it('should acquire stream and add to active streams', async () => {
      const mockStream = createLifecycleStream({
        id: 'stream-1',
        tracks: [createMediaTrackMock({ kind: 'video', label: 'Test' })]
      });
      mediaMock.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const constraints = { video: true };
      const stream = await lifecycle.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(lifecycle.activeStreams.has(mockStream)).toBe(true);
      expect(mediaMock.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
    });

    it('should log stream acquisition', async () => {
      const mockStream = createLifecycleStream({
        id: 'test',
        tracks: [createMediaTrackMock({ kind: 'video', label: 'Test' })]
      });
      mediaMock.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await lifecycle.acquireStream({ video: true });

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should reject stream with no tracks', async () => {
      const mockStream = createLifecycleStream({
        id: 'empty-stream',
        tracks: []
      });
      mediaMock.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow('Invalid stream: no tracks available');
    });

    it('should warn if stream is not active', async () => {
      const mockStream = createLifecycleStream({
        id: 'inactive-stream',
        active: false,
        tracks: [createMediaTrackMock({ kind: 'video', label: 'Test' })]
      });
      mediaMock.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await lifecycle.acquireStream({ video: true });

      expect(mockLogger.warn).toHaveBeenCalledWith('Acquired stream is not active');
    });

    it('should throw and log on acquisition failure', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mediaMock.mediaDevices.getUserMedia.mockRejectedValue(error);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow('Permission denied');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle errors without name property', async () => {
      const error = new Error('Unknown error');
      delete error.name;
      mediaMock.mediaDevices.getUserMedia.mockRejectedValue(error);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow();
    });

    it('should use injected mediaService when provided', async () => {
      const mockStream = createLifecycleStream({
        id: 'injected-stream',
        tracks: [createMediaTrackMock({ kind: 'video', label: 'Test' })]
      });
      const mockMediaService = createMediaServiceMock({ getUserMedia: vi.fn().mockResolvedValue(mockStream) });

      const lifecycleWithService = new BaseStreamLifecycle(mockLogger, mockMediaService);
      const constraints = { video: true };
      const stream = await lifecycleWithService.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(mockMediaService.getUserMedia).toHaveBeenCalledWith(constraints);
      expect(mediaMock.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('should fall back to navigator.mediaDevices when mediaService not provided', async () => {
      const mockStream = createLifecycleStream({
        id: 'navigator-stream',
        tracks: [createMediaTrackMock({ kind: 'video', label: 'Test' })]
      });
      mediaMock.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const lifecycleWithoutService = new BaseStreamLifecycle(mockLogger, null);
      const constraints = { video: true };
      const stream = await lifecycleWithoutService.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(mediaMock.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
    });
  });

  describe('releaseStream', () => {
    it('should stop all tracks and remove from active streams', async () => {
      const mockTrack = createMediaTrackMock({
        kind: 'video',
        label: 'Test Camera',
        stop: vi.fn()
      });
      const mockStream = createMediaStreamMock({
        tracks: [mockTrack]
      });

      lifecycle.activeStreams.add(mockStream);

      await lifecycle.releaseStream(mockStream);

      expect(mockTrack.stop).toHaveBeenCalled();
      expect(lifecycle.activeStreams.has(mockStream)).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Stream released successfully');
    });

    it('should warn and return for null stream', async () => {
      await lifecycle.releaseStream(null);

      expect(mockLogger.warn).toHaveBeenCalledWith('Attempted to release null stream');
    });

    it('should handle release errors per track', async () => {
      const mockTracks = [
        createMediaTrackMock({
          kind: 'video',
          label: 'Video',
          stop: vi.fn(() => {
            throw new Error('Track 1 error');
          })
        }),
        createMediaTrackMock({ kind: 'audio', label: 'Audio' })
      ];
      const mockStream = createMediaStreamMock({
        tracks: mockTracks
      });

      // Should not throw - continues with other tracks
      await lifecycle.releaseStream(mockStream);

      // Both tracks should have stop called (second track succeeds even if first fails)
      expect(mockTracks[0].stop).toHaveBeenCalled();
      expect(mockTracks[1].stop).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining('Error stopping track video'), expect.any(Error));
      expect(mockLogger.warn).toHaveBeenCalledWith('Stream released with 1 track error(s)');
    });

    it('should release multiple tracks', async () => {
      const mockTracks = [
        createMediaTrackMock({ kind: 'video', label: 'Video' }),
        createMediaTrackMock({ kind: 'audio', label: 'Audio' })
      ];
      const mockStream = createMediaStreamMock({
        tracks: mockTracks
      });

      await lifecycle.releaseStream(mockStream);

      expect(mockTracks[0].stop).toHaveBeenCalled();
      expect(mockTracks[1].stop).toHaveBeenCalled();
    });
  });

  describe('getStreamInfo', () => {
    it('should return null for null stream', () => {
      expect(lifecycle.getStreamInfo(null)).toBeNull();
    });

    it('should return stream info with tracks', () => {
      const mockStream = createLifecycleStream({
        id: 'stream-123',
        tracks: [createMediaTrackMock({
          kind: 'video',
          label: 'Test Camera',
          enabled: true,
          muted: false,
          readyState: 'live',
          getSettings: vi.fn(() => ({ width: 640, height: 480 }))
        })]
      });

      const info = lifecycle.getStreamInfo(mockStream);

      expect(info.id).toBe('stream-123');
      expect(info.active).toBe(true);
      expect(info.tracks).toHaveLength(1);
      expect(info.tracks[0].kind).toBe('video');
      expect(info.tracks[0].settings).toEqual({ width: 640, height: 480 });
    });

    it('should handle stream with multiple tracks', () => {
      const mockTracks = [
        createMediaTrackMock({
          kind: 'video',
          label: 'Video',
          enabled: true,
          muted: false,
          readyState: 'live',
          getSettings: vi.fn(() => ({}))
        }),
        createMediaTrackMock({
          kind: 'audio',
          label: 'Audio',
          enabled: true,
          muted: true,
          readyState: 'live',
          getSettings: vi.fn(() => ({}))
        })
      ];
      const mockStream = createLifecycleStream({
        id: 'multi-track',
        tracks: mockTracks
      });

      const info = lifecycle.getStreamInfo(mockStream);

      expect(info.tracks).toHaveLength(2);
    });
  });

  describe('_log', () => {
    it('should log when logger is available', () => {
      lifecycle._log('info', 'Test message', 'arg');
      expect(mockLogger.info).toHaveBeenCalledWith('Test message', 'arg');
    });

    it('should not throw when logger is null', () => {
      const noLoggerLifecycle = new BaseStreamLifecycle();
      expect(() => noLoggerLifecycle._log('info', 'Test')).not.toThrow();
    });
  });

  describe('_safeStringify', () => {
    it('should stringify objects', () => {
      const result = lifecycle._safeStringify({ key: 'value' });
      expect(result).toBe('{"key":"value"}');
    });

    it('should handle circular references', () => {
      const obj = {};
      obj.self = obj;

      const result = lifecycle._safeStringify(obj);

      expect(result).toBe('[object Object]');
    });

    it('should handle primitives', () => {
      expect(lifecycle._safeStringify('test')).toBe('"test"');
      expect(lifecycle._safeStringify(123)).toBe('123');
    });
  });
});
