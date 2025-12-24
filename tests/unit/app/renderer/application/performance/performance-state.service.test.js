/**
 * PerformanceStateService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceStateService } from '@renderer/application/performance/performance-state.service.js';

describe('PerformanceStateService', () => {
  let service;
  let mockLogger;
  let mockVisibilityAdapter;
  let mockUserActivityAdapter;
  let mockReducedMotionAdapter;
  let states;
  let visibilityCallback;
  let activityCallback;
  let motionCallback;

  beforeEach(() => {
    states = [];
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    // Mock VisibilityAdapter
    visibilityCallback = null;
    mockVisibilityAdapter = {
      isHidden: vi.fn(() => false),
      onVisibilityChange: vi.fn((callback) => {
        visibilityCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn()
    };

    // Mock UserActivityAdapter
    activityCallback = null;
    mockUserActivityAdapter = {
      onActivity: vi.fn((callback) => {
        activityCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn()
    };

    // Mock ReducedMotionAdapter
    motionCallback = null;
    mockReducedMotionAdapter = {
      prefersReducedMotion: vi.fn(() => false),
      onChange: vi.fn((callback) => {
        motionCallback = callback;
        return vi.fn();
      }),
      dispose: vi.fn()
    };

    service = new PerformanceStateService({
      loggerFactory: { create: () => mockLogger },
      visibilityAdapter: mockVisibilityAdapter,
      userActivityAdapter: mockUserActivityAdapter,
      reducedMotionAdapter: mockReducedMotionAdapter
    });
  });

  afterEach(() => {
    service.dispose();
    vi.restoreAllMocks();
  });

  it('should emit initial state on initialize', () => {
    service.initialize({
      onStateChange: (state) => states.push(state)
    });

    expect(states).toHaveLength(1);
    expect(states[0]).toEqual(
      expect.objectContaining({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        hidden: false,
        idle: false,
        reducedMotion: false
      })
    );
  });

  it('should initialize with current visibility state', () => {
    mockVisibilityAdapter.isHidden.mockReturnValue(true);

    service.initialize({
      onStateChange: (state) => states.push(state)
    });

    expect(states[0].hidden).toBe(true);
  });

  it('should initialize with current reduced motion preference', () => {
    mockReducedMotionAdapter.prefersReducedMotion.mockReturnValue(true);

    service.initialize({
      onStateChange: (state) => states.push(state)
    });

    expect(states[0].reducedMotion).toBe(true);
  });

  it('should subscribe to visibility changes on initialize', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    expect(mockVisibilityAdapter.onVisibilityChange).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should subscribe to user activity on initialize', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    expect(mockUserActivityAdapter.onActivity).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should subscribe to reduced motion changes on initialize', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    expect(mockReducedMotionAdapter.onChange).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should update performance mode state', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    const changed = service.setPerformanceModeEnabled(true);

    expect(changed).toBe(true);
    expect(states[states.length - 1].performanceModeEnabled).toBe(true);
  });

  it('should detect weak GPU based on capabilities', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    service.setCapabilities({ webgpu: false, webgl2: false, preferredAPI: 'canvas2d', maxTextureSize: 1024 });

    expect(states[states.length - 1].weakGpuDetected).toBe(true);
  });

  it('should clear idle when streaming starts', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    service._updateState({ idle: true });
    service.setStreaming(true);

    expect(states[states.length - 1].idle).toBe(false);
  });

  it('should update hidden state on visibility change', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    // Simulate visibility change
    visibilityCallback(true);

    expect(states[states.length - 1].hidden).toBe(true);
  });

  it('should clear idle state when document becomes hidden', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    service._updateState({ idle: true });
    visibilityCallback(true);

    expect(states[states.length - 1].idle).toBe(false);
  });

  it('should update reduced motion state when preference changes', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    // Simulate reduced motion preference change
    motionCallback(true);

    expect(states[states.length - 1].reducedMotion).toBe(true);
  });

  it('should reset idle timer on user activity', () => {
    vi.useFakeTimers();
    service.initialize({ onStateChange: (state) => states.push(state) });

    // Trigger idle timeout
    vi.advanceTimersByTime(30000);
    expect(states[states.length - 1].idle).toBe(true);

    // Simulate user activity
    activityCallback();

    expect(states[states.length - 1].idle).toBe(false);

    vi.useRealTimers();
  });

  it('should not track idle when streaming', () => {
    vi.useFakeTimers();
    service.initialize({ onStateChange: (state) => states.push(state) });
    service.setStreaming(true);

    // Try to trigger user activity
    activityCallback();

    // Fast-forward time
    vi.advanceTimersByTime(30000);

    // Should not become idle because streaming is active
    expect(states[states.length - 1].idle).toBe(false);

    vi.useRealTimers();
  });

  it('should not track idle when document is hidden', () => {
    vi.useFakeTimers();
    service.initialize({ onStateChange: (state) => states.push(state) });

    // Hide document
    visibilityCallback(true);

    // Try to trigger user activity
    activityCallback();

    // Fast-forward time
    vi.advanceTimersByTime(30000);

    // Should not become idle because document is hidden
    expect(states[states.length - 1].idle).toBe(false);

    vi.useRealTimers();
  });

  it('should call cleanup functions on dispose', () => {
    const visibilityCleanup = vi.fn();
    const activityCleanup = vi.fn();
    const motionCleanup = vi.fn();

    mockVisibilityAdapter.onVisibilityChange.mockReturnValue(visibilityCleanup);
    mockUserActivityAdapter.onActivity.mockReturnValue(activityCleanup);
    mockReducedMotionAdapter.onChange.mockReturnValue(motionCleanup);

    service.initialize({ onStateChange: (state) => states.push(state) });
    service.dispose();

    expect(visibilityCleanup).toHaveBeenCalled();
    expect(activityCleanup).toHaveBeenCalled();
    expect(motionCleanup).toHaveBeenCalled();
  });

  it('should handle dispose without initialization', () => {
    expect(() => service.dispose()).not.toThrow();
  });

  it('should return current state via getState', () => {
    service.initialize({ onStateChange: (state) => states.push(state) });

    const state = service.getState();

    expect(state).toEqual(
      expect.objectContaining({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        hidden: false,
        idle: false,
        reducedMotion: false
      })
    );
  });
});
