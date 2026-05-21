/**
 * PerformanceAnimationOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceAnimationOrchestrator } from '@renderer/application/orchestrators/performance-animation.orchestrator.ts';
import { EventChannels } from '@shared/events/event-channels.js';

describe('PerformanceAnimationOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let mockPerformanceAnimationService;
  let mockBodyClassManager;
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

    mockPerformanceAnimationService = {
      setPerformanceState: vi.fn(() => ({
        idle: false,
        hidden: false,
        animationsOff: false
      }))
    };

    mockBodyClassManager = {
      setIdle: vi.fn(),
      setHidden: vi.fn(),
      setAnimationsOff: vi.fn()
    };

    orchestrator = new PerformanceAnimationOrchestrator({
      eventBus: mockEventBus,
      animationPerformanceService: mockPerformanceAnimationService,
      bodyClassManager: mockBodyClassManager,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  it('should delegate performance state updates to the service and apply body classes', async () => {
    await orchestrator.onInitialize();

    const performanceState = {
      performanceModeEnabled: true,
      weakGpuDetected: false,
      reducedMotion: false,
      hidden: false,
      idle: false
    };

    mockPerformanceAnimationService.setPerformanceState.mockReturnValue({
      idle: false,
      hidden: false,
      animationsOff: true
    });

    handlers[EventChannels.PERFORMANCE.STATE_CHANGED](performanceState);

    expect(mockPerformanceAnimationService.setPerformanceState).toHaveBeenCalledWith(performanceState);
    expect(mockBodyClassManager.setIdle).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setHidden).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setAnimationsOff).toHaveBeenCalledWith(true);
  });

  it('should not duplicate canonical streaming-mode state', async () => {
    await orchestrator.onInitialize();

    expect(handlers[EventChannels.STREAM.STARTED]).toBeUndefined();
    expect(handlers[EventChannels.STREAM.STOPPED]).toBeUndefined();
  });

  it('should preserve animationsOff while applying performance state changes', async () => {
    await orchestrator.onInitialize();

    mockPerformanceAnimationService.setPerformanceState.mockReturnValue({
      idle: false,
      hidden: false,
      animationsOff: true
    });

    handlers[EventChannels.PERFORMANCE.STATE_CHANGED]({
      performanceModeEnabled: true,
      weakGpuDetected: false,
      reducedMotion: false,
      hidden: false,
      idle: false
    });

    expect(mockBodyClassManager.setAnimationsOff).toHaveBeenCalledWith(true);
  });
});
