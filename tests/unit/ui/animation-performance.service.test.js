/**
 * AnimationPerformanceService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  describe('setStreaming', () => {
    it('should return streaming=true when streaming is active', () => {
      const result = service.setStreaming(true);

      expect(result.streaming).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Streaming started - pausing decorative animations');
    });

    it('should return streaming=false when streaming is inactive', () => {
      const result = service.setStreaming(false);

      expect(result.streaming).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Streaming stopped - starting idle timer');
    });

    it('should preserve animationsOff state from performance mode', () => {
      // First enable performance mode
      service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      // Then change streaming - animationsOff should still be true
      const result = service.setStreaming(false);

      expect(result.streaming).toBe(false);
      expect(result.animationsOff).toBe(true);
    });
  });

  describe('setPerformanceState', () => {
    it('should return animationsOff=true when performance mode enabled', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(result.animationsOff).toBe(true);
      expect(result.hidden).toBe(false);
      expect(result.idle).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Performance mode enabled - pausing decorative animations');
    });

    it('should return hidden and idle states from performanceState', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: true,
        idle: true
      });

      expect(result.hidden).toBe(true);
      expect(result.idle).toBe(true);
      expect(result.animationsOff).toBe(false);
    });

    it('should suppress animations when reducedMotion is true', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: true,
        hidden: false,
        idle: false
      });

      expect(result.animationsOff).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Prefers-reduced-motion detected - pausing decorative animations');
    });

    it('should suppress animations when weakGPU detected with performance mode', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: true,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(result.animationsOff).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Weak GPU detected - pausing decorative animations to reduce load (performance mode enabled)');
    });

    it('should not suppress for weakGPU alone without performance mode', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: false,
        weakGpuDetected: true,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(result.animationsOff).toBe(false);
    });

    it('should preserve streaming state when updating performance state', () => {
      // First set streaming
      service.setStreaming(true);

      // Then update performance state - streaming should still be true
      const result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(result.streaming).toBe(true);
      expect(result.animationsOff).toBe(true);
    });
  });

  describe('animation suppression tracking', () => {
    it('should accumulate suppression reasons', () => {
      // First call: performance mode
      let result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });
      expect(result.animationsOff).toBe(true);

      // Second call: add reduced motion
      result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: true,
        hidden: false,
        idle: false
      });
      expect(result.animationsOff).toBe(true);

      // Third call: remove performance mode but keep reduced motion
      result = service.setPerformanceState({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: true,
        hidden: false,
        idle: false
      });
      expect(result.animationsOff).toBe(true);
    });
  });

  describe('state isolation between streaming and performance', () => {
    it('should maintain independent state tracking', () => {
      // Set performance mode
      service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: true,
        idle: true
      });

      // Set streaming
      service.setStreaming(true);

      // Stop streaming - should still have performance state
      const result = service.setStreaming(false);

      expect(result.streaming).toBe(false);
      expect(result.hidden).toBe(true);
      expect(result.idle).toBe(true);
      expect(result.animationsOff).toBe(true);
    });

    it('should disable animationsOff when performance mode disabled and streaming changes', () => {
      // Set performance mode off
      service.setPerformanceState({
        performanceModeEnabled: false,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      // Change streaming - animationsOff should remain false
      const result = service.setStreaming(true);

      expect(result.animationsOff).toBe(false);
    });
  });
});
