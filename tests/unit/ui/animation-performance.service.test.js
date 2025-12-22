/**
 * AnimationPerformanceService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AnimationPerformanceService } from '@renderer/application/performance/animation-performance.service.js';

describe('AnimationPerformanceService', () => {
  let service;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    service = new AnimationPerformanceService({
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    document.body.className = '';
  });

  it('should suppress animations when performance mode enabled', () => {
    service.updatePerformanceState({
      performanceModeEnabled: true,
      weakGpuDetected: false,
      reducedMotion: false,
      hidden: false,
      idle: false
    });

    expect(document.body.classList.contains('app-animations-off')).toBe(true);
  });

  it('should apply hidden and idle classes', () => {
    service.updatePerformanceState({
      performanceModeEnabled: false,
      weakGpuDetected: false,
      reducedMotion: false,
      hidden: true,
      idle: true
    });

    expect(document.body.classList.contains('app-hidden')).toBe(true);
    expect(document.body.classList.contains('app-idle')).toBe(true);
  });

  it('should toggle streaming class based on streaming state', () => {
    service.updateStreamingState(true);
    expect(document.body.classList.contains('app-streaming')).toBe(true);

    service.updateStreamingState(false);
    expect(document.body.classList.contains('app-streaming')).toBe(false);
  });
});
