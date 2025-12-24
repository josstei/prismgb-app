/**
 * BaseStreamLifecycle Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseStreamLifecycle } from '@shared/streaming/acquisition/stream.lifecycle.js';

describe('BaseStreamLifecycle', () => {
  let lifecycle;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    lifecycle = new BaseStreamLifecycle(mockLogger);

    // Mock navigator.mediaDevices
    global.navigator = {
      mediaDevices: {
        getUserMedia: vi.fn(),
        getSupportedConstraints: vi.fn(() => ({ width: true, height: true }))
      }
    };
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
      const mockMediaService = { getUserMedia: vi.fn() };
      const lifecycleWithService = new BaseStreamLifecycle(mockLogger, mockMediaService);
      expect(lifecycleWithService.mediaService).toBe(mockMediaService);
    });

    it('should default mediaService to null when not provided', () => {
      expect(lifecycle.mediaService).toBeNull();
    });
  });

  describe('acquireStream', () => {
    it('should acquire stream and add to active streams', async () => {
      const mockStream = {
        id: 'stream-1',
        active: true,
        getTracks: vi.fn(() => [{ kind: 'video', label: 'Test' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const constraints = { video: true };
      const stream = await lifecycle.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(lifecycle.activeStreams.has(mockStream)).toBe(true);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
    });

    it('should log stream acquisition', async () => {
      const mockStream = {
        id: 'test',
        active: true,
        getTracks: vi.fn(() => [{ kind: 'video', label: 'Test' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await lifecycle.acquireStream({ video: true });

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should reject stream with no tracks', async () => {
      const mockStream = {
        id: 'empty-stream',
        active: true,
        getTracks: vi.fn(() => [])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow('Invalid stream: no tracks available');
    });

    it('should warn if stream is not active', async () => {
      const mockStream = {
        id: 'inactive-stream',
        active: false,
        getTracks: vi.fn(() => [{ kind: 'video', label: 'Test' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      await lifecycle.acquireStream({ video: true });

      expect(mockLogger.warn).toHaveBeenCalledWith('Acquired stream is not active');
    });

    it('should throw and log on acquisition failure', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      navigator.mediaDevices.getUserMedia.mockRejectedValue(error);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow('Permission denied');

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle errors without name property', async () => {
      const error = new Error('Unknown error');
      delete error.name;
      navigator.mediaDevices.getUserMedia.mockRejectedValue(error);

      await expect(lifecycle.acquireStream({ video: true })).rejects.toThrow();
    });

    it('should use injected mediaService when provided', async () => {
      const mockStream = {
        id: 'injected-stream',
        active: true,
        getTracks: vi.fn(() => [{ kind: 'video', label: 'Test' }])
      };
      const mockMediaService = {
        getUserMedia: vi.fn().mockResolvedValue(mockStream)
      };

      const lifecycleWithService = new BaseStreamLifecycle(mockLogger, mockMediaService);
      const constraints = { video: true };
      const stream = await lifecycleWithService.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(mockMediaService.getUserMedia).toHaveBeenCalledWith(constraints);
      expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    });

    it('should fall back to navigator.mediaDevices when mediaService not provided', async () => {
      const mockStream = {
        id: 'navigator-stream',
        active: true,
        getTracks: vi.fn(() => [{ kind: 'video', label: 'Test' }])
      };
      navigator.mediaDevices.getUserMedia.mockResolvedValue(mockStream);

      const lifecycleWithoutService = new BaseStreamLifecycle(mockLogger, null);
      const constraints = { video: true };
      const stream = await lifecycleWithoutService.acquireStream(constraints);

      expect(stream).toBe(mockStream);
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
    });
  });

  describe('releaseStream', () => {
    it('should stop all tracks and remove from active streams', async () => {
      const mockTrack = {
        stop: vi.fn(),
        kind: 'video',
        label: 'Test Camera'
      };
      const mockStream = {
        getTracks: vi.fn(() => [mockTrack])
      };

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

    it('should handle release errors', async () => {
      const mockStream = {
        getTracks: vi.fn(() => {
          throw new Error('Track error');
        })
      };

      await expect(lifecycle.releaseStream(mockStream)).rejects.toThrow('Track error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should release multiple tracks', async () => {
      const mockTracks = [
        { stop: vi.fn(), kind: 'video', label: 'Video' },
        { stop: vi.fn(), kind: 'audio', label: 'Audio' }
      ];
      const mockStream = {
        getTracks: vi.fn(() => mockTracks)
      };

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
      const mockTrack = {
        kind: 'video',
        label: 'Test Camera',
        enabled: true,
        muted: false,
        readyState: 'live',
        getSettings: vi.fn(() => ({ width: 640, height: 480 }))
      };
      const mockStream = {
        id: 'stream-123',
        active: true,
        getTracks: vi.fn(() => [mockTrack])
      };

      const info = lifecycle.getStreamInfo(mockStream);

      expect(info.id).toBe('stream-123');
      expect(info.active).toBe(true);
      expect(info.tracks).toHaveLength(1);
      expect(info.tracks[0].kind).toBe('video');
      expect(info.tracks[0].settings).toEqual({ width: 640, height: 480 });
    });

    it('should handle stream with multiple tracks', () => {
      const mockTracks = [
        {
          kind: 'video',
          label: 'Video',
          enabled: true,
          muted: false,
          readyState: 'live',
          getSettings: vi.fn(() => ({}))
        },
        {
          kind: 'audio',
          label: 'Audio',
          enabled: true,
          muted: true,
          readyState: 'live',
          getSettings: vi.fn(() => ({}))
        }
      ];
      const mockStream = {
        id: 'multi-track',
        active: true,
        getTracks: vi.fn(() => mockTracks)
      };

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
