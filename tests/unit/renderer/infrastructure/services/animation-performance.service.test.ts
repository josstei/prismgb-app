/**
 * PerformanceAnimationService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceAnimationService } from '@renderer/infrastructure/services/performance-animation.service';
import { createLoggerFactory } from '../../../../factories/index.js';

describe('PerformanceAnimationService', () => {
  let service;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();

    service = new PerformanceAnimationService({
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('PerformanceAnimationService');
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

    it('should derive animation suppression from performance state only', () => {
      const result = service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: false,
        idle: false
      });

      expect(result).toEqual({
        hidden: false,
        idle: false,
        animationsOff: true
      });
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

  describe('state isolation', () => {
    it('should maintain hidden and idle state while suppression reasons change', () => {
      service.setPerformanceState({
        performanceModeEnabled: true,
        weakGpuDetected: false,
        reducedMotion: false,
        hidden: true,
        idle: true
      });

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
  });
});
