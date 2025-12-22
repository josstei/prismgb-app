/**
 * PerformanceStateService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PerformanceStateService } from '@renderer/application/performance/performance-state.service.js';

describe('PerformanceStateService', () => {
  let service;
  let mockLogger;
  let states;

  beforeEach(() => {
    states = [];
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    };

    global.window.matchMedia = vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });

    service = new PerformanceStateService({
      loggerFactory: { create: () => mockLogger }
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

    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    service._handleVisibilityChange();

    expect(states[states.length - 1].hidden).toBe(true);
  });
});
