/**
 * PerformanceOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PerformanceOrchestrator } from '@renderer/application/orchestrators/performance.orchestrator.ts';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('PerformanceOrchestrator', () => {
  let orchestrator;
  let handlers;
  let onStateChange;
  let mockEventBus;
  let mockLogger;
  let mockPerformanceStateService;
  let mockAnimationPerformanceService;
  let mockPerformanceMetricsService;
  let mockBodyClassManager;

  beforeEach(() => {
    handlers = {};

    mockEventBus = {
      subscribe: vi.fn((event, handler) => {
        handlers[event] = handler;
        return vi.fn();
      }),
      publish: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockPerformanceStateService = {
      initialize: vi.fn(({ onStateChange: callback }) => {
        onStateChange = callback;
      }),
      setPerformanceModeEnabled: vi.fn(() => true),
      setCapabilities: vi.fn(),
      setStreaming: vi.fn(),
      dispose: vi.fn()
    };

    mockAnimationPerformanceService = {
      setStreaming: vi.fn(() => ({
        streaming: true,
        idle: false,
        hidden: false,
        animationsOff: false
      })),
      setPerformanceState: vi.fn(() => ({
        streaming: false,
        idle: true,
        hidden: false,
        animationsOff: true
      }))
    };

    mockPerformanceMetricsService = {
      requestSnapshot: vi.fn(),
      startPeriodicSnapshots: vi.fn(),
      stopPeriodicSnapshots: vi.fn(),
      clearPendingRequests: vi.fn()
    };

    mockBodyClassManager = {
      setStreaming: vi.fn(),
      setIdle: vi.fn(),
      setHidden: vi.fn(),
      setAnimationsOff: vi.fn()
    };

    orchestrator = new PerformanceOrchestrator({
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) },
      performanceStateService: mockPerformanceStateService,
      animationPerformanceService: mockAnimationPerformanceService,
      performanceMetricsService: mockPerformanceMetricsService,
      bodyClassManager: mockBodyClassManager
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes state service before event subscriptions', async () => {
    const callOrder = [];
    mockPerformanceStateService.initialize.mockImplementation(({ onStateChange: callback }) => {
      callOrder.push('state:init');
      onStateChange = callback;
    });
    mockEventBus.subscribe.mockImplementation((event, handler) => {
      callOrder.push(`sub:${event}`);
      handlers[event] = handler;
      return vi.fn();
    });

    await orchestrator.onInitialize();

    expect(callOrder[0]).toBe('state:init');
    expect(callOrder.slice(1).length).toBeGreaterThan(0);
  });

  it('handles stream started/stopped by updating state + animation + body classes', async () => {
    mockAnimationPerformanceService.setStreaming
      .mockReturnValueOnce({ streaming: true, idle: false, hidden: false, animationsOff: false })
      .mockReturnValueOnce({ streaming: false, idle: true, hidden: false, animationsOff: true });

    await orchestrator.onInitialize();
    handlers[EventChannels.STREAM.STARTED]();
    handlers[EventChannels.STREAM.STOPPED]();

    expect(mockPerformanceStateService.setStreaming).toHaveBeenCalledWith(true);
    expect(mockPerformanceStateService.setStreaming).toHaveBeenCalledWith(false);
    expect(mockAnimationPerformanceService.setStreaming).toHaveBeenCalledWith(true);
    expect(mockAnimationPerformanceService.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setStreaming).toHaveBeenCalledWith(false);
    expect(mockBodyClassManager.setIdle).toHaveBeenCalledWith(true);
  });

  it('publishes state change and de-dupes UI mode updates', async () => {
    await orchestrator.onInitialize();

    const state = {
      performanceModeEnabled: true,
      weakGpuDetected: false,
      hidden: false,
      idle: false,
      reducedMotion: false
    };

    onStateChange(state);
    onStateChange(state);

    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.PERFORMANCE.STATE_CHANGED, state);
    const uiModeCalls = mockEventBus.publish.mock.calls
      .filter(([eventName]) => eventName === EventChannels.PERFORMANCE.UI_MODE_CHANGED);
    expect(uiModeCalls.length).toBe(1);
    expect(uiModeCalls[0][1]).toEqual({ enabled: true, weakGpuDetected: false });
  });

  it('forwards performance mode/capability/snapshot events', async () => {
    await orchestrator.onInitialize();

    handlers[EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED](true);
    handlers[EventChannels.RENDER.CAPABILITY_DETECTED]({ webgl2: true });
    handlers[EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]({ label: 'test' });

    expect(mockPerformanceStateService.setPerformanceModeEnabled).toHaveBeenCalledWith(true);
    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, true);
    expect(mockPerformanceStateService.setCapabilities).toHaveBeenCalledWith({ webgl2: true });
    expect(mockPerformanceMetricsService.requestSnapshot).toHaveBeenCalledWith({ label: 'test' });
  });

  it('starts periodic snapshots only in dev mode', async () => {
    const originalDev = import.meta.env.DEV;
    import.meta.env.DEV = true;

    await orchestrator.onInitialize();
    expect(mockPerformanceMetricsService.startPeriodicSnapshots).toHaveBeenCalled();

    import.meta.env.DEV = false;
    mockPerformanceMetricsService.startPeriodicSnapshots.mockClear();
    await orchestrator.onInitialize();
    expect(mockPerformanceMetricsService.startPeriodicSnapshots).not.toHaveBeenCalled();

    import.meta.env.DEV = originalDev;
  });

  it('cleans up state and metrics services', async () => {
    await orchestrator.onCleanup();

    expect(mockPerformanceStateService.dispose).toHaveBeenCalled();
    expect(mockPerformanceMetricsService.stopPeriodicSnapshots).toHaveBeenCalled();
    expect(mockPerformanceMetricsService.clearPendingRequests).toHaveBeenCalled();
  });
});
