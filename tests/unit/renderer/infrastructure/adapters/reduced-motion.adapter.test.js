/**
 * ReducedMotionAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';

describe('ReducedMotionAdapter', () => {
  let adapter;
  let mockMediaQuery;

  beforeEach(() => {
    adapter = new ReducedMotionAdapter();

    // Mock matchMedia
    mockMediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn()
    };

    global.window.matchMedia = vi.fn(() => mockMediaQuery);
  });

  afterEach(() => {
    adapter.dispose();
    vi.restoreAllMocks();
  });

  describe('prefersReducedMotion', () => {
    it('should return false when reduced motion is not preferred', () => {
      mockMediaQuery.matches = false;
      expect(adapter.prefersReducedMotion()).toBe(false);
    });

    it('should return true when reduced motion is preferred', () => {
      mockMediaQuery.matches = true;
      expect(adapter.prefersReducedMotion()).toBe(true);
    });

    it('should call matchMedia with correct query', () => {
      adapter.prefersReducedMotion();
      expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });
  });

  describe('onChange', () => {
    it('should call callback when preference changes (modern addEventListener)', () => {
      const callback = vi.fn();
      adapter.onChange(callback);

      // Simulate change event
      const changeHandler = mockMediaQuery.addEventListener.mock.calls[0][1];
      changeHandler({ matches: true });

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should use addEventListener if available', () => {
      const callback = vi.fn();
      adapter.onChange(callback);

      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(mockMediaQuery.addListener).not.toHaveBeenCalled();
    });

    it('should use addListener as fallback if addEventListener not available', () => {
      delete mockMediaQuery.addEventListener;
      delete mockMediaQuery.removeEventListener;

      const callback = vi.fn();
      adapter.onChange(callback);

      expect(mockMediaQuery.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should call callback when preference changes (legacy addListener)', () => {
      delete mockMediaQuery.addEventListener;
      delete mockMediaQuery.removeEventListener;

      const callback = vi.fn();
      adapter.onChange(callback);

      // Simulate change event
      const changeHandler = mockMediaQuery.addListener.mock.calls[0][0];
      changeHandler({ matches: true });

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should return cleanup function', () => {
      const callback = vi.fn();
      const cleanup = adapter.onChange(callback);

      expect(typeof cleanup).toBe('function');
    });

    it('should remove listener when cleanup is called (modern)', () => {
      const callback = vi.fn();
      const cleanup = adapter.onChange(callback);

      cleanup();

      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should remove listener when cleanup is called (legacy)', () => {
      delete mockMediaQuery.addEventListener;
      delete mockMediaQuery.removeEventListener;

      const callback = vi.fn();
      const cleanup = adapter.onChange(callback);

      cleanup();

      expect(mockMediaQuery.removeListener).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('dispose', () => {
    it('should remove event listener (modern)', () => {
      const callback = vi.fn();
      adapter.onChange(callback);

      adapter.dispose();

      expect(mockMediaQuery.removeEventListener).toHaveBeenCalledWith(
        'change',
        expect.any(Function)
      );
    });

    it('should remove event listener (legacy)', () => {
      delete mockMediaQuery.addEventListener;
      delete mockMediaQuery.removeEventListener;

      const callback = vi.fn();
      adapter.onChange(callback);

      adapter.dispose();

      expect(mockMediaQuery.removeListener).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle multiple dispose calls safely', () => {
      const callback = vi.fn();
      adapter.onChange(callback);

      adapter.dispose();
      adapter.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
