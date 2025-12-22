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

    orchestrator = new AnimationPerformanceOrchestrator({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.className = '';
    vi.restoreAllMocks();
  });

  describe('performance state handling', () => {
    it('should suppress animations when performance mode enabled', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.STATE_CHANGED]({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should suppress animations when reduced motion is enabled', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.STATE_CHANGED]({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: true,
        hidden: false,
        idle: false
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should toggle hidden and idle classes', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.STATE_CHANGED]({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: true,
        idle: true
      });

      expect(document.body.classList.contains('app-hidden')).toBe(true);
      expect(document.body.classList.contains('app-idle')).toBe(true);
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
  });

  describe('_isAnimationsSuppressed', () => {
    it('should return true when any suppression is active', async () => {
      await orchestrator.onInitialize();

      handlers[EventChannels.PERFORMANCE.STATE_CHANGED]({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(orchestrator._isAnimationsSuppressed()).toBe(true);
    });
  });
});
