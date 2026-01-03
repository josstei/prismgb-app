/**
 * PerformanceAnimationOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceAnimationOrchestrator } from '@renderer/application/performance/performance-animation.orchestrator.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

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
      setStreaming: vi.fn((isStreaming) => ({
        streaming: isStreaming,
        idle: false,
        hidden: false,
        animationsOff: false
      })),
      setPerformanceState: vi.fn(() => ({
        streaming: false,
        idle: false,
        hidden: false,
        animationsOff: false
      }))
    };

    mockBodyClassManager = {
      setStreaming: vi.fn(),
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
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: true
    });

    handlers[EventChannels.PERFORMANCE.STATE_CHANGED](performanceState);

    expect(mockPerformanceAnimationService.setPerformanceState).toHaveBeenCalledWith(performanceState);
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setIdle).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setHidden).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setAnimationsOff).toHaveBeenCalledWith(true);
  });

  it('should delegate streaming state updates to the service and apply body classes', async () => {
    await orchestrator.onInitialize();

    mockPerformanceAnimationService.setStreaming.mockReturnValue({
      streaming: true,
      idle: false,
      hidden: false,
      animationsOff: false
    });

    handlers[EventChannels.STREAM.STARTED]();

    expect(mockPerformanceAnimationService.setStreaming).toHaveBeenCalledWith(true);
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(true);

    mockPerformanceAnimationService.setStreaming.mockReturnValue({
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: false
    });

    handlers[EventChannels.STREAM.STOPPED]();

    expect(mockPerformanceAnimationService.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(false);
  });

  it('should preserve animationsOff when stream stops with performance mode enabled', async () => {
    await orchestrator.onInitialize();

    // When stream stops but performance mode is on, animationsOff should stay true
    mockPerformanceAnimationService.setStreaming.mockReturnValue({
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: true // performance mode keeps this true
    });

    handlers[EventChannels.STREAM.STOPPED]();

    expect(mockPerformanceAnimationService.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setAnimationsOff).toHaveBeenCalledWith(true);
  });
});
