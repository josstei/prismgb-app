/**
 * ConstraintBuilder Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConstraintBuilder } from '@features/streaming/acquisition/constraint.builder.js';

describe('ConstraintBuilder', () => {
  let builder;
  let mockLogger;
  let mockContext;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockContext = {
      getDeviceConstraint: vi.fn(() => ({ exact: 'video-device-id' })),
      getAudioDeviceConstraint: vi.fn(() => ({ exact: 'audio-device-id' })),
      profile: {
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        },
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 60 }
        }
      }
    };

    builder = new ConstraintBuilder(mockLogger);
  });

  describe('constructor', () => {
    it('should create builder with logger', () => {
      expect(builder.logger).toBe(mockLogger);
    });

    it('should create builder without logger', () => {
      const builderNoLogger = new ConstraintBuilder();
      expect(builderNoLogger.logger).toBeNull();
    });
  });

  describe('build - full detail level', () => {
    it('should build full constraints with audio and video', () => {
      const constraints = builder.build(mockContext, 'full');

      expect(constraints.audio).toEqual({
        deviceId: { exact: 'audio-device-id' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleRate: 48000
      });

      expect(constraints.video).toEqual({
        deviceId: { exact: 'video-device-id' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 }
      });
    });

    it('should use full as default detail level', () => {
      const constraints = builder.build(mockContext);

      expect(constraints.audio.sampleRate).toBe(48000);
      expect(constraints.video.frameRate).toEqual({ ideal: 60 });
    });

    it('should log debug message with constraints', () => {
      builder.build(mockContext, 'full');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Built constraints (full)',
        expect.any(Object)
      );
    });
  });

  describe('build - simple detail level', () => {
    it('should build simple video constraints with dimensions only', () => {
      const constraints = builder.build(mockContext, 'simple');

      expect(constraints.video).toEqual({
        deviceId: { exact: 'video-device-id' },
        width: 1920,
        height: 1080
      });
    });

    it('should build simple audio constraints with processing flags', () => {
      const constraints = builder.build(mockContext, 'simple');

      expect(constraints.audio).toEqual({
        deviceId: { exact: 'audio-device-id' },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      });
    });
  });

  describe('build - minimal detail level', () => {
    it('should build minimal constraints with device targeting only', () => {
      const constraints = builder.build(mockContext, 'minimal');

      expect(constraints.audio).toEqual({
        deviceId: { exact: 'audio-device-id' }
      });

      expect(constraints.video).toEqual({
        deviceId: { exact: 'video-device-id' }
      });
    });
  });

  describe('build - options', () => {
    it('should disable audio when options.audio is false', () => {
      const constraints = builder.build(mockContext, 'full', { audio: false });

      expect(constraints.audio).toBe(false);
      expect(constraints.video).toBeDefined();
    });

    it('should disable video when options.video is false', () => {
      const constraints = builder.build(mockContext, 'full', { video: false });

      expect(constraints.video).toBe(false);
      expect(constraints.audio).toBeDefined();
    });

    it('should disable both when both options are false', () => {
      const constraints = builder.build(mockContext, 'full', { audio: false, video: false });

      expect(constraints.audio).toBe(false);
      expect(constraints.video).toBe(false);
    });

    it('should enable audio by default', () => {
      const constraints = builder.build(mockContext, 'full', {});

      expect(constraints.audio).not.toBe(false);
    });
  });

  describe('build - profile without audio', () => {
    it('should set audio to false when profile has no audio', () => {
      mockContext.profile = {
        video: { width: 1920, height: 1080 }
      };

      const constraints = builder.build(mockContext, 'full');

      expect(constraints.audio).toBe(false);
    });
  });

  describe('build - profile without video', () => {
    it('should set video to false when profile has no video', () => {
      mockContext.profile = {
        audio: { sampleRate: 48000 }
      };

      const constraints = builder.build(mockContext, 'full');

      expect(constraints.video).toBe(false);
    });
  });

  describe('_extractIdeal', () => {
    it('should extract ideal value from object', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal({ ideal: 1920 })).toBe(1920);
    });

    it('should extract exact value when no ideal', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal({ exact: 1080 })).toBe(1080);
    });

    it('should return plain value as-is', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal(60)).toBe(60);
    });

    it('should return undefined for null', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal(null)).toBeUndefined();
    });

    it('should return undefined for undefined', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal(undefined)).toBeUndefined();
    });

    it('should prefer ideal over exact', () => {
      const builder2 = new ConstraintBuilder();
      expect(builder2._extractIdeal({ ideal: 1920, exact: 1080 })).toBe(1920);
    });

    it('should return object itself if no ideal or exact', () => {
      const builder2 = new ConstraintBuilder();
      const obj = { min: 720, max: 1080 };
      expect(builder2._extractIdeal(obj)).toBe(obj);
    });
  });

  describe('_log', () => {
    it('should call logger method when logger exists', () => {
      builder._log('debug', 'test message', { data: 1 });

      expect(mockLogger.debug).toHaveBeenCalledWith('test message', { data: 1 });
    });

    it('should not throw when logger is null', () => {
      const builderNoLogger = new ConstraintBuilder(null);

      expect(() => builderNoLogger._log('debug', 'test')).not.toThrow();
    });

    it('should not throw when logger method does not exist', () => {
      const partialLogger = { info: vi.fn() };
      const builderPartial = new ConstraintBuilder(partialLogger);

      expect(() => builderPartial._log('debug', 'test')).not.toThrow();
    });
  });
});
