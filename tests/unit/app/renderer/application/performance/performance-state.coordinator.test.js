/**
 * Performance State Coordinator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceStateCoordinator } from '@app/renderer/application/performance/performance-state.coordinator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('PerformanceStateCoordinator', () => {
  let coordinator;
  let mockEventBus;
  let mockLogger;
  let eventHandlers;
  let mockMatchMedia;

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

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });

    mockMatchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));
    global.window.matchMedia = mockMatchMedia;

    coordinator = new PerformanceStateCoordinator({
      eventBus: mockEventBus,
      loggerFactory: { create: () => mockLogger }
    });
  });

  afterEach(() => {
    coordinator.cleanup();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize default state', () => {
      expect(coordinator._state.performanceModeEnabled).toBe(false);
      expect(coordinator._state.weakGpuDetected).toBe(false);
      expect(coordinator._state.hidden).toBe(false);
      expect(coordinator._state.idle).toBe(false);
      expect(coordinator._state.reducedMotion).toBe(false);
    });

    it('should subscribe to performance signals on initialize', async () => {
      await coordinator.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.RENDER.CAPABILITY_DETECTED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.STREAM.STARTED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.STREAM.STOPPED,
        expect.any(Function)
      );
    });
  });

  describe('performance mode changes', () => {
    beforeEach(async () => {
      await coordinator.initialize();
    });

    it('should publish render mode and state when enabled', () => {
      eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.RENDER_MODE_CHANGED,
        true
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.UI_MODE_CHANGED,
        { enabled: true, weakGpuDetected: false }
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.STATE_CHANGED,
        expect.objectContaining({ performanceModeEnabled: true })
      );
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

      expect(coordinator._state.weakGpuDetected).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.UI_MODE_CHANGED,
        { enabled: false, weakGpuDetected: true }
      );
    });
  });

  describe('visibility handling', () => {
    it('should update hidden state on visibility change', async () => {
      await coordinator.initialize();

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      coordinator._handleVisibilityChange();

      expect(coordinator._state.hidden).toBe(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.PERFORMANCE.STATE_CHANGED,
        expect.objectContaining({ hidden: true })
      );
    });
  });

  describe('reduced motion handling', () => {
    it('should capture reduced motion preference', async () => {
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      await coordinator.initialize();

      expect(coordinator._state.reducedMotion).toBe(true);
    });
  });

  describe('idle handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should mark idle after timeout when allowed', async () => {
      await coordinator.initialize();

      vi.advanceTimersByTime(30000);

      expect(coordinator._state.idle).toBe(true);
    });

    it('should clear idle when streaming starts', async () => {
      await coordinator.initialize();
      coordinator._state.idle = true;

      eventHandlers[EventChannels.STREAM.STARTED]();

      expect(coordinator._state.idle).toBe(false);
    });
  });
});
