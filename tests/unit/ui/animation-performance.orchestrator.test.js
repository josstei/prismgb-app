/**
 * AnimationPerformanceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationPerformanceOrchestrator } from '@app/renderer/application/performance/animation-performance.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('AnimationPerformanceOrchestrator', () => {
  let orchestrator;
  let mockEventBus;
  let mockLogger;
  let mockAnimationPerformanceService;
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
      updatePerformanceState: vi.fn(),
      updateStreamingState: vi.fn()
    };

    orchestrator = new AnimationPerformanceOrchestrator({
      eventBus: mockEventBus,
      animationPerformanceService: mockAnimationPerformanceService,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  it('should delegate performance state updates to the service', async () => {
    await orchestrator.onInitialize();

    const state = { performanceModeEnabled: true };
    handlers[EventChannels.PERFORMANCE.STATE_CHANGED](state);

    expect(mockAnimationPerformanceService.updatePerformanceState).toHaveBeenCalledWith(state);
  });

  it('should delegate streaming state updates to the service', async () => {
    await orchestrator.onInitialize();

    handlers[EventChannels.STREAM.STARTED]();
    handlers[EventChannels.STREAM.STOPPED]();

    expect(mockAnimationPerformanceService.updateStreamingState).toHaveBeenCalledWith(true);
    expect(mockAnimationPerformanceService.updateStreamingState).toHaveBeenCalledWith(false);
  });
});
