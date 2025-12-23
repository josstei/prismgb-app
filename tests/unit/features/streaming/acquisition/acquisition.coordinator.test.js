/**
 * StreamAcquisitionCoordinator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamAcquisitionCoordinator } from '@shared/streaming/acquisition/acquisition.coordinator.js';
import { AcquisitionContext } from '@shared/streaming/acquisition/acquisition.context.js';

describe('StreamAcquisitionCoordinator', () => {
  let coordinator;
  let mockConstraintBuilder;
  let mockStreamLifecycle;
  let mockLogger;
  let mockFallbackStrategy;
  let mockContext;

  beforeEach(() => {
    mockConstraintBuilder = {
      build: vi.fn()
    };

    mockStreamLifecycle = {
      acquireStream: vi.fn()
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockFallbackStrategy = {
      initialize: vi.fn(),
      hasMore: vi.fn(),
      getNext: vi.fn()
    };

    coordinator = new StreamAcquisitionCoordinator({
      constraintBuilder: mockConstraintBuilder,
      streamLifecycle: mockStreamLifecycle,
      logger: mockLogger,
      fallbackStrategy: mockFallbackStrategy
    });

    mockContext = new AcquisitionContext({
      deviceId: 'test-device-123',
      profile: {
        audio: { sampleRate: 48000 },
        video: { width: 160, height: 144 }
      }
    });
  });

  describe('Constructor', () => {
    it('should store dependencies', () => {
      expect(coordinator.constraintBuilder).toBe(mockConstraintBuilder);
      expect(coordinator.streamLifecycle).toBe(mockStreamLifecycle);
      expect(coordinator.logger).toBe(mockLogger);
    });

    it('should use default DeviceAwareFallbackStrategy if not provided', () => {
      const coordWithDefaults = new StreamAcquisitionCoordinator({});
      expect(coordWithDefaults.fallbackStrategy).toBeDefined();
    });
  });

  describe('acquire', () => {
    const mockStream = { id: 'stream-1' };
    const mockConstraints = { audio: { deviceId: { exact: 'test-device-123' } }, video: { deviceId: { exact: 'test-device-123' }, width: 160 } };

    beforeEach(() => {
      mockConstraintBuilder.build.mockReturnValue(mockConstraints);
    });

    it('should initialize fallback strategy with context', async () => {
      mockStreamLifecycle.acquireStream.mockResolvedValue(mockStream);

      await coordinator.acquire(mockContext);

      expect(mockFallbackStrategy.initialize).toHaveBeenCalledWith(mockContext);
    });

    it('should acquire stream with primary strategy', async () => {
      mockStreamLifecycle.acquireStream.mockResolvedValue(mockStream);

      const result = await coordinator.acquire(mockContext);

      expect(result.stream).toBe(mockStream);
      expect(result.strategy).toBe('full');
      expect(result.context).toBe(mockContext);
    });

    it('should build constraints with full detail level', async () => {
      mockStreamLifecycle.acquireStream.mockResolvedValue(mockStream);

      await coordinator.acquire(mockContext);

      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(mockContext, 'full', {});
    });

    it('should pass options to constraint builder', async () => {
      mockStreamLifecycle.acquireStream.mockResolvedValue(mockStream);

      await coordinator.acquire(mockContext, { audio: false });

      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(mockContext, 'full', { audio: false });
    });

    it('should try fallbacks when primary fails', async () => {
      const primaryError = new Error('Primary failed');
      mockStreamLifecycle.acquireStream
        .mockRejectedValueOnce(primaryError)
        .mockResolvedValueOnce(mockStream);

      mockFallbackStrategy.hasMore.mockReturnValueOnce(true).mockReturnValueOnce(false);
      mockFallbackStrategy.getNext.mockReturnValue({
        name: 'simple',
        detailLevel: 'simple',
        audio: true,
        video: true,
        description: 'Simplified constraints'
      });

      const result = await coordinator.acquire(mockContext);

      expect(result.stream).toBe(mockStream);
      expect(result.strategy).toBe('simple');
    });

    it('should try simple constraints on OverconstrainedError', async () => {
      const overconstrainedError = new Error('Overconstrained');
      overconstrainedError.name = 'OverconstrainedError';

      mockStreamLifecycle.acquireStream
        .mockRejectedValueOnce(overconstrainedError)
        .mockResolvedValueOnce(mockStream);

      mockFallbackStrategy.hasMore.mockReturnValue(false);

      const result = await coordinator.acquire(mockContext);

      expect(result.strategy).toBe('full-softened');
      // Should have built with 'simple' detail level on retry
      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(mockContext, 'simple', {});
    });

    it('should throw after all fallbacks exhausted', async () => {
      mockStreamLifecycle.acquireStream.mockRejectedValue(new Error('Always fails'));
      mockFallbackStrategy.hasMore.mockReturnValue(false);

      await expect(coordinator.acquire(mockContext)).rejects.toThrow(
        /Stream acquisition failed after all attempts/
      );
    });

    it('should include device ID in error message', async () => {
      mockStreamLifecycle.acquireStream.mockRejectedValue(new Error('Always fails'));
      mockFallbackStrategy.hasMore.mockReturnValue(false);

      await expect(coordinator.acquire(mockContext)).rejects.toThrow(
        /test-device-123/
      );
    });

    it('should iterate through multiple fallbacks', async () => {
      const primaryError = new Error('Failed');
      mockStreamLifecycle.acquireStream
        .mockRejectedValueOnce(primaryError)
        .mockRejectedValueOnce(primaryError)
        .mockResolvedValueOnce(mockStream);

      mockFallbackStrategy.hasMore
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      mockFallbackStrategy.getNext
        .mockReturnValueOnce({ name: 'first-fallback', detailLevel: 'simple', audio: true, video: true, description: 'First' })
        .mockReturnValueOnce({ name: 'second-fallback', detailLevel: 'minimal', audio: false, video: true, description: 'Second' });

      const result = await coordinator.acquire(mockContext);

      expect(result.strategy).toBe('second-fallback');
    });

    it('should break loop when getNext returns null', async () => {
      mockStreamLifecycle.acquireStream.mockRejectedValue(new Error('Failed'));
      mockFallbackStrategy.hasMore.mockReturnValue(true);
      mockFallbackStrategy.getNext.mockReturnValue(null);

      await expect(coordinator.acquire(mockContext)).rejects.toThrow();
    });

    it('should use fallback detail level and audio/video flags', async () => {
      const primaryError = new Error('Failed');
      mockStreamLifecycle.acquireStream
        .mockRejectedValueOnce(primaryError)
        .mockResolvedValueOnce(mockStream);

      mockFallbackStrategy.hasMore.mockReturnValueOnce(true).mockReturnValueOnce(false);
      mockFallbackStrategy.getNext.mockReturnValue({
        name: 'video-only',
        detailLevel: 'minimal',
        audio: false,
        video: true,
        description: 'Video only'
      });

      await coordinator.acquire(mockContext);

      // Verify constraint builder was called with fallback config
      expect(mockConstraintBuilder.build).toHaveBeenCalledWith(
        mockContext,
        'minimal',
        expect.objectContaining({ audio: false, video: true })
      );
    });

    it('should preserve device targeting in all constraint builds', async () => {
      const capturedBuildCalls = [];
      mockConstraintBuilder.build.mockImplementation((ctx, level, opts) => {
        capturedBuildCalls.push({ context: ctx, detailLevel: level, options: opts });
        return mockConstraints;
      });

      const primaryError = new Error('Failed');
      mockStreamLifecycle.acquireStream
        .mockRejectedValueOnce(primaryError)
        .mockResolvedValueOnce(mockStream);

      mockFallbackStrategy.hasMore.mockReturnValueOnce(true).mockReturnValueOnce(false);
      mockFallbackStrategy.getNext.mockReturnValue({
        name: 'fallback',
        detailLevel: 'simple',
        audio: true,
        video: true,
        description: 'Test'
      });

      await coordinator.acquire(mockContext);

      // All builds should use the same context (device targeting preserved)
      capturedBuildCalls.forEach(call => {
        expect(call.context).toBe(mockContext);
      });
    });
  });

  describe('_stringifyConstraints', () => {
    it('should stringify valid JSON', () => {
      const constraints = { video: { width: 160 } };
      const result = coordinator._stringifyConstraints(constraints);
      expect(result).toBe('{"video":{"width":160}}');
    });

    it('should handle circular references', () => {
      const constraints = {};
      constraints.self = constraints;

      const result = coordinator._stringifyConstraints(constraints);

      // Should not throw and return string representation
      expect(typeof result).toBe('string');
    });
  });

  describe('_log', () => {
    it('should call logger method when available', () => {
      coordinator._log('info', 'Test message', 'arg1');
      expect(mockLogger.info).toHaveBeenCalledWith('Test message', 'arg1');
    });

    it('should not throw when logger is null', () => {
      coordinator.logger = null;
      expect(() => coordinator._log('info', 'Test')).not.toThrow();
    });

    it('should not throw for invalid log level', () => {
      expect(() => coordinator._log('nonexistent', 'Test')).not.toThrow();
    });
  });
});
