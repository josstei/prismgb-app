/**
 * Performance Mode Coordinator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceModeCoordinator } from '@app/renderer/application/performance/performance-mode.coordinator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('PerformanceModeCoordinator', () => {
  let coordinator;
  let mockEventBus;
  let mockLogger;
  let eventHandlers;

  beforeEach(() => {
    eventHandlers = {};
    mockEventBus = {
      subscribe: vi.fn((channel, handler) => {
        eventHandlers[channel] = handler;
        return vi.fn();
      }),
      publish: vi.fn()
    };
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };
    const mockLoggerFactory = { create: () => mockLogger };

    coordinator = new PerformanceModeCoordinator({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    coordinator.cleanup();
  });

  describe('initialization', () => {
    it('should initialize with performance mode disabled', async () => {
      expect(coordinator._performanceModeEnabled).toBe(false);
    });

    it('should initialize with weak GPU not detected', async () => {
      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should subscribe to performance mode changes on initialize', async () => {
      await coordinator.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
        expect.any(Function)
      );
    });

    it('should subscribe to render capability detection on initialize', async () => {
      await coordinator.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.RENDER.CAPABILITY_DETECTED,
        expect.any(Function)
      );
    });
  });

  describe('performance mode changes', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should publish render mode change when performance mode enabled', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        true
      );
    });

    it('should publish render mode change when performance mode disabled', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](false);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        false
      );
    });

    it('should emit UI performance state when mode changes', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.UI_MODE_CHANGED,
        { enabled: true, weakGpuDetected: false }
      );
    });

    it('should convert truthy values to boolean', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](1);

      expect(coordinator._performanceModeEnabled).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        true
      );
    });

    it('should convert falsy values to boolean', () => {
      coordinator._performanceModeEnabled = true;
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](0);

      expect(coordinator._performanceModeEnabled).toBe(false);
    });
  });

  describe('GPU capability detection', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should detect weak GPU when no accelerated path available', () => {
      const capabilities = {
        webgpu: false,
        webgl2: false,
        preferredAPI: 'canvas2d',
        maxTextureSize: 4096
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(true);
    });

    it('should detect weak GPU when using canvas fallback', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'canvas2d',
        maxTextureSize: 4096
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(true);
    });

    it('should detect weak GPU when texture budget is low', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'webgpu',
        maxTextureSize: 1024
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(true);
    });

    it('should not detect weak GPU with good capabilities', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'webgpu',
        maxTextureSize: 4096
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should not detect weak GPU with webgl2 only', () => {
      const capabilities = {
        webgpu: false,
        webgl2: true,
        preferredAPI: 'webgl2',
        maxTextureSize: 4096
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should handle null capabilities', () => {
      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](null);

      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should handle undefined capabilities', () => {
      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](undefined);

      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should emit UI performance state after capability detection', () => {
      const capabilities = {
        webgpu: false,
        webgl2: false,
        preferredAPI: 'canvas2d',
        maxTextureSize: 4096
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.UI_MODE_CHANGED,
        { enabled: false, weakGpuDetected: true }
      );
    });

    it('should handle zero maxTextureSize', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'webgpu',
        maxTextureSize: 0
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(false);
    });

    it('should detect weak GPU at exact texture threshold', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'webgpu',
        maxTextureSize: 2047
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(true);
    });

    it('should not detect weak GPU at minimum good texture size', () => {
      const capabilities = {
        webgpu: true,
        webgl2: true,
        preferredAPI: 'webgpu',
        maxTextureSize: 2048
      };

      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(coordinator._weakGpuDetected).toBe(false);
    });
  });

  describe('combined state', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should emit combined state with both enabled and weak GPU', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);

      const capabilities = {
        webgpu: false,
        webgl2: false,
        preferredAPI: 'canvas2d',
        maxTextureSize: 4096
      };
      eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

      expect(mockEventBus.publish).toHaveBeenLastCalledWith(
        EventChannels.PERFORMANCE.UI_MODE_CHANGED,
        { enabled: true, weakGpuDetected: true }
      );
    });
  });
});
