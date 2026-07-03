/**
 * PerformanceAnimationOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceAnimationOrchestrator } from '@renderer/application/orchestrators/performance/performance-animation.orchestrator';
import { EventChannels } from '@platform/events';
import { createEventBus } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('PerformanceAnimationOrchestrator', () => {
  let orchestrator;
  let mockPerformanceAnimationService;
  let mockBodyClassManager;
  let handlers;

  beforeEach(() => {
    handlers = {};
    const h = createInjectableHarness(PerformanceAnimationOrchestrator, {
      overrides: {
        eventBus: createEventBus({
          onSubscribe: (channel, handler) => {
            handlers[channel] = handler;
          }
        })
      }
    });
    orchestrator = h.subject;
    ({
      animationPerformanceService: mockPerformanceAnimationService,
      bodyClassManager: mockBodyClassManager
    } = h.deps);
  });

  it('should delegate performance state updates to the service and apply body classes', async () => {
    await orchestrator.initialize();

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
    await orchestrator.initialize();

    expect(handlers[EventChannels.STREAM.STARTED]).toBeUndefined();
    expect(handlers[EventChannels.STREAM.STOPPED]).toBeUndefined();
  });

  it('should preserve animationsOff while applying performance state changes', async () => {
    await orchestrator.initialize();

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
