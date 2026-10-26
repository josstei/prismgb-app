import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformEventBus, EventChannels, type PerformanceStatePayload } from '@platform/events';
import { PerformanceStateOrchestrator } from '@renderer/application/orchestrators/performance/performance-state.orchestrator';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';

describe('PerformanceStateOrchestrator', () => {
  let orchestrator: PerformanceStateOrchestrator;
  let bus: PlatformEventBus;
  let states: PerformanceStatePayload[];
  let appState: { isStreaming: boolean };
  let visibility: ReturnType<typeof createAdapters>['visibilityAdapter'];
  let activity: ReturnType<typeof createAdapters>['userActivityAdapter'];
  let motion: ReturnType<typeof createAdapters>['reducedMotionAdapter'];

  function createAdapters() {
    return {
      visibilityAdapter: {
        isHidden: vi.fn(() => false),
        onVisibilityChange: vi.fn<(callback: (hidden: boolean) => void) => () => void>(() => vi.fn())
      },
      userActivityAdapter: {
        onActivity: vi.fn<(callback: () => void) => () => void>(() => vi.fn())
      },
      reducedMotionAdapter: {
        prefersReducedMotion: vi.fn(() => false),
        onChange: vi.fn<(callback: (reducedMotion: boolean) => void) => () => void>(() => vi.fn())
      }
    };
  }

  const currentState = () => states.at(-1)!;
  const setHidden = (hidden: boolean) => visibility.onVisibilityChange.mock.calls.at(-1)![0](hidden);
  const userActivity = () => activity.onActivity.mock.calls.at(-1)![0]();

  beforeEach(() => {
    vi.useFakeTimers();
    states = [];
    bus = new PlatformEventBus();
    bus.subscribe<PerformanceStatePayload>(EventChannels.PERFORMANCE.STATE_CHANGED, state => { states.push(state); });
    const adapters = createAdapters();
    appState = { isStreaming: false };
    visibility = adapters.visibilityAdapter;
    activity = adapters.userActivityAdapter;
    motion = adapters.reducedMotionAdapter;
    orchestrator = new PerformanceStateOrchestrator({ appState, eventBus: bus, loggerFactory: createLoggerFactory(), ...adapters });
  });

  afterEach(async () => {
    await orchestrator.cleanup();
    vi.useRealTimers();
  });

  it('publishes the initial browser state and remains active after repeated initialization', async () => {
    await orchestrator.initialize();
    await orchestrator.initialize();
    expect(states).toEqual([{ performanceModeEnabled: false, hidden: false, idle: false, reducedMotion: false }]);
    expect(visibility.onVisibilityChange).toHaveBeenCalledOnce();
    expect(activity.onActivity).toHaveBeenCalledOnce();
    expect(motion.onChange).toHaveBeenCalledOnce();
  });

  it('preserves visibility then reduced-motion publication order at startup', async () => {
    visibility.isHidden.mockReturnValue(true);
    motion.prefersReducedMotion.mockReturnValue(true);
    await orchestrator.initialize();
    expect(states.map(({ hidden, reducedMotion }) => [hidden, reducedMotion])).toEqual([
      [true, false], [true, true], [true, true]
    ]);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(false);
  });

  it('publishes performance state before render mode and ignores unchanged settings', async () => {
    await orchestrator.initialize();
    const publish = vi.spyOn(bus, 'publish');
    bus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, true);
    expect(publish.mock.calls.map(([event]) => event)).toEqual([
      EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
      EventChannels.PERFORMANCE.STATE_CHANGED,
      EventChannels.PERFORMANCE.RENDER_MODE_CHANGED
    ]);
    expect(currentState().performanceModeEnabled).toBe(true);
    publish.mockClear();
    bus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, true);
    expect(publish).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(false);
  });

  it('enters idle after thirty seconds and resets on activity', async () => {
    await orchestrator.initialize();
    vi.advanceTimersByTime(29999);
    expect(currentState().idle).toBe(false);
    vi.advanceTimersByTime(1);
    expect(currentState().idle).toBe(true);
    userActivity();
    expect(currentState().idle).toBe(false);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });

  it('throttles idle-timer resets to once per second', async () => {
    await orchestrator.initialize();
    vi.advanceTimersByTime(1000);
    userActivity();
    vi.advanceTimersByTime(500);
    userActivity();
    vi.advanceTimersByTime(29500);
    expect(currentState().idle).toBe(true);
  });

  it('clears idle while streaming and restarts the timer after stop', async () => {
    await orchestrator.initialize();
    vi.advanceTimersByTime(30000);
    appState.isStreaming = true;
    bus.publish(EventChannels.STREAM.STARTED);
    expect(currentState().idle).toBe(false);
    userActivity();
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(false);
    appState.isStreaming = false;
    bus.publish(EventChannels.STREAM.STOPPED);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });

  it('does not enter idle when streaming began before its subscriptions existed', async () => {
    appState.isStreaming = true;
    await orchestrator.initialize();
    vi.advanceTimersByTime(60000);
    expect(currentState().idle).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    appState.isStreaming = false;
    bus.publish(EventChannels.STREAM.STOPPED);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });

  it('clears idle on hide, ignores hidden activity and resumes idle tracking on show', async () => {
    await orchestrator.initialize();
    vi.advanceTimersByTime(30000);
    setHidden(true);
    expect(states.slice(-2).map(({ hidden, idle }) => [hidden, idle])).toEqual([[true, true], [true, false]]);
    userActivity();
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(false);
    setHidden(false);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });

  it('resumes idle tracking when performance mode is disabled', async () => {
    await orchestrator.initialize();
    bus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, true);
    vi.advanceTimersByTime(30000);
    bus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, false);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });

  it('publishes changed motion preferences without mutating prior snapshots', async () => {
    await orchestrator.initialize();
    motion.onChange.mock.calls[0][0](true);
    expect(states[0].reducedMotion).toBe(false);
    expect(currentState().reducedMotion).toBe(true);
  });

  it('releases browser subscriptions, timers and event handlers on cleanup', async () => {
    await orchestrator.initialize();
    await orchestrator.cleanup();
    for (const subscribe of [visibility.onVisibilityChange, activity.onActivity, motion.onChange]) {
      expect(subscribe.mock.results[0].value).toHaveBeenCalledOnce();
    }
    bus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, true);
    vi.advanceTimersByTime(30000);
    expect(states).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('releases partial initialization when a browser adapter fails', async () => {
    const failure = new Error('motion subscription failed');
    motion.onChange.mockImplementation(() => { throw failure; });
    await expect(orchestrator.initialize()).rejects.toBe(failure);
    expect(visibility.onVisibilityChange.mock.results[0].value).toHaveBeenCalledOnce();
    expect(bus.emitter.listenerCount(EventChannels.STREAM.STARTED)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reinitializes with fresh subscriptions after cleanup', async () => {
    await orchestrator.initialize();
    await orchestrator.cleanup();
    await orchestrator.initialize();
    expect(visibility.onVisibilityChange).toHaveBeenCalledTimes(2);
    expect(bus.emitter.listenerCount(EventChannels.STREAM.STARTED)).toBe(1);
    vi.advanceTimersByTime(30000);
    expect(currentState().idle).toBe(true);
  });
});
