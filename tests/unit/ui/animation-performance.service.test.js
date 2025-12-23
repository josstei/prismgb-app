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

  describe('setState with streaming parameter', () => {
    it('should return streaming=true when streaming is active', () => {
      const result = service.setState({ streaming: true });

      expect(result.streaming).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Streaming started - pausing decorative animations');
    });

    it('should return streaming=false when streaming is inactive', () => {
      const result = service.setState({ streaming: false });

      expect(result.streaming).toBe(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Streaming stopped - starting idle timer');
    });
  });

  describe('setState with performanceState parameter', () => {
    it('should return animationsOff=true when performance mode enabled', () => {
      const result = service.setState({
        performanceState: {
          performanceModeEnabled: true,
          weakGpuDetected: false,
          reducedMotion: false,
          hidden: false,
          idle: false
        }
      });

      expect(result.animationsOff).toBe(true);
      expect(result.hidden).toBe(false);
      expect(result.idle).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Performance mode enabled - pausing decorative animations');
    });

    it('should return hidden and idle states from performanceState', () => {
      const result = service.setState({
        performanceState: {
          performanceModeEnabled: false,
          weakGpuDetected: false,
          reducedMotion: false,
          hidden: true,
          idle: true
        }
      });

      expect(result.hidden).toBe(true);
      expect(result.idle).toBe(true);
      expect(result.animationsOff).toBe(false);
    });

    it('should suppress animations when reducedMotion is true', () => {
      const result = service.setState({
        performanceState: {
          performanceModeEnabled: false,
          weakGpuDetected: false,
          reducedMotion: true,
          hidden: false,
          idle: false
        }
      });

      expect(result.animationsOff).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Prefers-reduced-motion detected - pausing decorative animations');
    });

    it('should suppress animations when weakGPU detected with performance mode', () => {
      const result = service.setState({
        performanceState: {
          performanceModeEnabled: true,
          weakGpuDetected: true,
          reducedMotion: false,
          hidden: false,
          idle: false
        }
      });

      expect(result.animationsOff).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Weak GPU detected - pausing decorative animations to reduce load (performance mode enabled)');
    });

    it('should not suppress for weakGPU alone without performance mode', () => {
      const result = service.setState({
        performanceState: {
          performanceModeEnabled: false,
          weakGpuDetected: true,
          reducedMotion: false,
          hidden: false,
          idle: false
        }
      });

      expect(result.animationsOff).toBe(false);
    });
  });

  describe('setState with combined parameters', () => {
    it('should handle both streaming and performanceState together', () => {
      const result = service.setState({
        streaming: true,
        performanceState: {
          performanceModeEnabled: true,
          weakGpuDetected: false,
          reducedMotion: false,
          hidden: true,
          idle: false
        }
      });

      expect(result.streaming).toBe(true);
      expect(result.hidden).toBe(true);
      expect(result.idle).toBe(false);
      expect(result.animationsOff).toBe(true);
    });
  });

  describe('setState with no parameters', () => {
    it('should return default state when called with empty object', () => {
      const result = service.setState({});

      expect(result.streaming).toBe(false);
      expect(result.idle).toBe(false);
      expect(result.hidden).toBe(false);
      expect(result.animationsOff).toBe(false);
    });
  });

  describe('animation suppression tracking', () => {
    it('should accumulate suppression reasons', () => {
      // First call: performance mode
      let result = service.setState({
        performanceState: {
          performanceModeEnabled: true,
          weakGpuDetected: false,
          reducedMotion: false,
          hidden: false,
          idle: false
        }
      });
      expect(result.animationsOff).toBe(true);

      // Second call: add reduced motion
      result = service.setState({
        performanceState: {
          performanceModeEnabled: true,
          weakGpuDetected: false,
          reducedMotion: true,
          hidden: false,
          idle: false
        }
      });
      expect(result.animationsOff).toBe(true);

      // Third call: remove performance mode but keep reduced motion
      result = service.setState({
        performanceState: {
          performanceModeEnabled: false,
          weakGpuDetected: false,
          reducedMotion: true,
          hidden: false,
          idle: false
        }
      });
      expect(result.animationsOff).toBe(true);
    });
  });
});
