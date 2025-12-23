/**
 * AnimationPerformanceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationPerformanceOrchestrator } from '@renderer/application/performance/animation-performance.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('AnimationPerformanceOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let mockAnimationPerformanceService;
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

    mockAnimationPerformanceService = {
      setState: vi.fn((params) => ({
        streaming: params.streaming ?? false,
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

    orchestrator = new AnimationPerformanceOrchestrator({
      eventBus: mockEventBus,
      animationPerformanceService: mockAnimationPerformanceService,
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

    mockAnimationPerformanceService.setState.mockReturnValue({
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: true
    });

    handlers[EventChannels.PERFORMANCE.STATE_CHANGED](performanceState);

    expect(mockAnimationPerformanceService.setState).toHaveBeenCalledWith({ performanceState });
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setIdle).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setHidden).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setAnimationsOff).toHaveBeenCalledWith(true);
  });

  it('should delegate streaming state updates to the service and apply body classes', async () => {
    await orchestrator.onInitialize();

    mockAnimationPerformanceService.setState.mockReturnValue({
      streaming: true,
      idle: false,
      hidden: false,
      animationsOff: false
    });

    handlers[EventChannels.STREAM.STARTED]();

    expect(mockAnimationPerformanceService.setState).toHaveBeenCalledWith({ streaming: true });
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(true);

    mockAnimationPerformanceService.setState.mockReturnValue({
      streaming: false,
      idle: false,
      hidden: false,
      animationsOff: false
    });

    handlers[EventChannels.STREAM.STOPPED]();

    expect(mockAnimationPerformanceService.setState).toHaveBeenCalledWith({ streaming: false });
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(false);
  });
});
