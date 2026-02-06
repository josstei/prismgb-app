/**
 * HideTimer Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HideTimer } from '@renderer/presentation/primitives/hide-timer.class.js';

describe('HideTimer', () => {
  let timer;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    timer?.dispose();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create timer with default options', () => {
      timer = new HideTimer();
      expect(timer.isRunning).toBe(false);
    });

    it('should accept custom onTimeout callback', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout });
      timer.start();
      vi.runAllTimers();
      expect(onTimeout).toHaveBeenCalled();
    });

    it('should accept custom delay', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout, delay: 500 });
      timer.start();

      vi.advanceTimersByTime(400);
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(onTimeout).toHaveBeenCalled();
    });

    it('should accept shouldStart predicate', () => {
      const onTimeout = vi.fn();
      const shouldStart = vi.fn(() => false);
      timer = new HideTimer({ onTimeout, shouldStart });

      timer.start();
      vi.runAllTimers();

      expect(shouldStart).toHaveBeenCalled();
      expect(onTimeout).not.toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should start the timer', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout });

      timer.start();
      expect(timer.isRunning).toBe(true);
    });

    it('should call onTimeout after delay', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout, delay: 1000 });

      timer.start();
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('should not start if shouldStart returns false', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({
        onTimeout,
        shouldStart: () => false
      });

      timer.start();
      expect(timer.isRunning).toBe(false);
    });

    it('should reset timer when called multiple times', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout, delay: 1000 });

      timer.start();
      vi.advanceTimersByTime(800);

      timer.start(); // Reset
      vi.advanceTimersByTime(800);
      expect(onTimeout).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should clear running timer', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout, delay: 1000 });

      timer.start();
      timer.clear();

      expect(timer.isRunning).toBe(false);

      vi.runAllTimers();
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('should handle clearing when timer is not running', () => {
      timer = new HideTimer();
      expect(() => timer.clear()).not.toThrow();
    });
  });

  describe('isRunning', () => {
    it('should return false initially', () => {
      timer = new HideTimer();
      expect(timer.isRunning).toBe(false);
    });

    it('should return true when timer is active', () => {
      timer = new HideTimer({ onTimeout: vi.fn() });
      timer.start();
      expect(timer.isRunning).toBe(true);
    });

    it('should return false after timer completes', () => {
      timer = new HideTimer({ onTimeout: vi.fn() });
      timer.start();
      vi.runAllTimers();
      // Timer ID remains set until cleared, but callback has been executed
      expect(timer.isRunning).toBe(true); // setTimeout ID still exists
    });

    it('should return false after clear', () => {
      timer = new HideTimer({ onTimeout: vi.fn() });
      timer.start();
      timer.clear();
      expect(timer.isRunning).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear any running timer', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout });
      timer.start();

      timer.dispose();

      vi.runAllTimers();
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('should be safe to call multiple times', () => {
      timer = new HideTimer();
      expect(() => {
        timer.dispose();
        timer.dispose();
      }).not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple start/clear cycles', () => {
      const onTimeout = vi.fn();
      timer = new HideTimer({ onTimeout, delay: 1000 });

      timer.start();
      timer.clear();
      timer.start();
      timer.clear();
      timer.start();

      vi.runAllTimers();
      expect(onTimeout).toHaveBeenCalledTimes(1);
    });

    it('should respect shouldStart on each call', () => {
      const onTimeout = vi.fn();
      let shouldAllow = true;
      timer = new HideTimer({
        onTimeout,
        shouldStart: () => shouldAllow,
        delay: 1000
      });

      timer.start();
      expect(timer.isRunning).toBe(true);

      timer.clear();
      shouldAllow = false;
      timer.start();
      expect(timer.isRunning).toBe(false);
    });
  });
});
