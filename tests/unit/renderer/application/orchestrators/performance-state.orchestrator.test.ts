/**
 * PerformanceStateOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceStateOrchestrator } from '@renderer/application/orchestrators/performance-state.orchestrator';
import { EventChannels } from '@prismgb/events';
import {
  createEventBus,
  createLoggerFactory,
  createPerformanceStateServiceMock
} from '../../../../factories/index.js';

describe('PerformanceStateOrchestrator', () => {
  let coordinator;
  let mockEventBus;
  let mockLoggerFactory;
  let mockPerformanceStateService;
  let eventHandlers;
  let onStateChange;

  beforeEach(() => {
    eventHandlers = {};
    mockEventBus = createEventBus({
      onSubscribe: (channel, handler) => {
        eventHandlers[channel] = handler;
      }
    });
    mockLoggerFactory = createLoggerFactory();

    mockPerformanceStateService = createPerformanceStateServiceMock({
      initialize: vi.fn(({ onStateChange: callback }) => {
        onStateChange = callback;
      })
    });

    coordinator = new PerformanceStateOrchestrator({
      eventBus: mockEventBus,
      performanceStateService: mockPerformanceStateService,
      loggerFactory: mockLoggerFactory
    });
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
    expect(mockPerformanceStateService.initialize).toHaveBeenCalled();
  });

  it('should publish render mode change when performance mode toggles', async () => {
    await coordinator.initialize();

    eventHandlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);

    expect(mockPerformanceStateService.setPerformanceModeEnabled).toHaveBeenCalledWith(true);
    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, true);
  });

  it('should forward capability changes to the performance state service', async () => {
    await coordinator.initialize();

    const capabilities = { webgl2: true };
    eventHandlers[EventChannels.RENDER.CAPABILITY_DETECTED](capabilities);

    expect(mockPerformanceStateService.setCapabilities).toHaveBeenCalledWith(capabilities);
  });

  it('should forward streaming changes to the performance state service', async () => {
    await coordinator.initialize();

    eventHandlers[EventChannels.STREAM.STARTED]();
    eventHandlers[EventChannels.STREAM.STOPPED]();

    expect(mockPerformanceStateService.setStreaming).toHaveBeenCalledWith(true);
    expect(mockPerformanceStateService.setStreaming).toHaveBeenCalledWith(false);
  });

  it('should publish state and UI mode changes when state updates', async () => {
    await coordinator.initialize();

    const state = {
      performanceModeEnabled: true,
      weakGpuDetected: false,
      hidden: false,
      idle: false,
      reducedMotion: false
    };

    onStateChange(state);

    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.PERFORMANCE.STATE_CHANGED, state);
    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.PERFORMANCE.UI_MODE_CHANGED, {
      enabled: true,
      weakGpuDetected: false
    });
  });

  it('should dispose performance state service on cleanup', async () => {
    await coordinator.onCleanup();

    expect(mockPerformanceStateService.dispose).toHaveBeenCalled();
  });
});
