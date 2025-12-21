/**
 * AnimationPerformanceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnimationPerformanceOrchestrator } from '@app/renderer/application/performance/animation-performance.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('AnimationPerformanceOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let handlers;
  let mockMatchMedia;

  beforeEach(() => {
    handlers = {};
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn((channel, handler) => {
        handlers[channel] = handler;
        return vi.fn();
      })
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
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

    orchestrator = new AnimationPerformanceOrchestrator({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  describe('performance mode handling', () => {
    it('should suppress animations when performance mode and weak GPU are enabled', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: true
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should clear suppression when performance mode is disabled', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: false
      });
      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: false,
        weakGpuDetected: false
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(false);
    });

    it('should handle boolean state for backwards compatibility', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED](true);

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Performance mode enabled'));
    });

    it('should suppress animations when only performance mode enabled (no weak GPU)', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: false
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should log additional message when weak GPU detected', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: true
      });

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Weak GPU detected'));
    });

    it('should restart idle timer when disabled and no suppressions active', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: false
      });
      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: false,
        weakGpuDetected: false
      });

      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });
  });

  describe('streaming state handling', () => {
    it('should add streaming class when stream starts', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.STREAM.STARTED]();

      expect(document.body.classList.contains('app-streaming')).toBe(true);
    });

    it('should remove streaming class when stream stops', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.STREAM.STARTED]();
      handlers[EventChannels.STREAM.STOPPED]();

      expect(document.body.classList.contains('app-streaming')).toBe(false);
    });

    it('should remove idle class when streaming starts', async () => {
      await orchestrator.onInitialize();
      document.body.classList.add('app-idle');

      handlers[EventChannels.STREAM.STARTED]();

      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should log when streaming state changes', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.STREAM.STARTED]();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Streaming started'));

      handlers[EventChannels.STREAM.STOPPED]();
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Streaming stopped'));
    });
  });

  describe('visibility handling', () => {
    it('should add hidden class when document becomes hidden', async () => {
      await orchestrator.onInitialize();

      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      orchestrator._handleVisibilityChange();

      expect(document.body.classList.contains('app-hidden')).toBe(true);
    });

    it('should remove hidden class when document becomes visible', async () => {
      await orchestrator.onInitialize();
      document.body.classList.add('app-hidden');

      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      orchestrator._handleVisibilityChange();

      expect(document.body.classList.contains('app-hidden')).toBe(false);
    });
  });

  describe('reduced motion handling', () => {
    it('should suppress animations when prefers-reduced-motion is set', async () => {
      mockMatchMedia.mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      });

      await orchestrator.onInitialize();

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should handle matchMedia change events', async () => {
      let changeHandler;
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn((event, handler) => {
          changeHandler = handler;
        }),
        removeEventListener: vi.fn()
      });

      await orchestrator.onInitialize();
      changeHandler({ matches: true });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Prefers-reduced-motion'));
    });

    it('should handle Safari legacy addListener API', async () => {
      let changeHandler;
      mockMatchMedia.mockReturnValue({
        matches: false,
        addListener: vi.fn((handler) => {
          changeHandler = handler;
        }),
        removeListener: vi.fn()
      });

      await orchestrator.onInitialize();
      changeHandler({ matches: true });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });
  });

  describe('idle handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should add idle class after idle timeout', async () => {
      await orchestrator.onInitialize();

      vi.advanceTimersByTime(30000);

      expect(document.body.classList.contains('app-idle')).toBe(true);
    });

    it('should not add idle class when streaming', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.STREAM.STARTED]();
      vi.advanceTimersByTime(30000);

      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should not start idle timer when document is hidden', async () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      await orchestrator.onInitialize();

      vi.advanceTimersByTime(30000);

      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should reset idle timer on user activity', async () => {
      await orchestrator.onInitialize();

      vi.advanceTimersByTime(20000);
      vi.advanceTimersByTime(1001);
      orchestrator._handleUserActivity();

      vi.advanceTimersByTime(20000);

      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should throttle user activity handling', async () => {
      await orchestrator.onInitialize();

      orchestrator._handleUserActivity();
      vi.advanceTimersByTime(500);
      orchestrator._handleUserActivity();

      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should ignore user activity when streaming', async () => {
      await orchestrator.onInitialize();
      handlers[EventChannels.STREAM.STARTED]();

      orchestrator._handleUserActivity();
    });

    it('should ignore user activity when hidden', async () => {
      await orchestrator.onInitialize();
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });

      orchestrator._handleUserActivity();
    });
  });

  describe('cleanup', () => {
    it('should clean up visibility listener on cleanup', async () => {
      const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');
      await orchestrator.onInitialize();

      await orchestrator.onCleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    });

    it('should clean up motion preference listener on cleanup', async () => {
      const mockRemoveEventListener = vi.fn();
      mockMatchMedia.mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: mockRemoveEventListener
      });

      await orchestrator.onInitialize();
      await orchestrator.onCleanup();

      expect(mockRemoveEventListener).toHaveBeenCalled();
    });

    it('should clear idle timer on cleanup', async () => {
      vi.useFakeTimers();
      await orchestrator.onInitialize();

      await orchestrator.onCleanup();
      vi.advanceTimersByTime(30000);

      expect(document.body.classList.contains('app-idle')).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('_isAnimationsSuppressed', () => {
    it('should return true when any suppression is active', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.UI_MODE_CHANGED]({
        enabled: true,
        weakGpuDetected: false
      });

      expect(orchestrator._isAnimationsSuppressed()).toBe(true);
    });

    it('should return false when no suppressions are active', async () => {
      await orchestrator.onInitialize();

      expect(orchestrator._isAnimationsSuppressed()).toBe(false);
    });
  });
});
