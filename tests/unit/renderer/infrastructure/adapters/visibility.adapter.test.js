/**
 * VisibilityAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';

describe('VisibilityAdapter', () => {
  let adapter;
  let visibilityChangeListeners;

  beforeEach(() => {
    visibilityChangeListeners = [];
    adapter = new VisibilityAdapter();

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });

    // Mock document.addEventListener
    vi.spyOn(document, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'visibilitychange') {
        visibilityChangeListeners.push(listener);
      }
    });

    vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    adapter.dispose();
    vi.restoreAllMocks();
  });

  describe('isHidden', () => {
    it('should return false when document is visible', () => {
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      expect(adapter.isHidden()).toBe(false);
    });

    it('should return true when document is hidden', () => {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      expect(adapter.isHidden()).toBe(true);
    });
  });

  describe('onVisibilityChange', () => {
    it('should call callback when visibility changes', () => {
      const callback = vi.fn();
      adapter.onVisibilityChange(callback);

      // Simulate visibility change
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      visibilityChangeListeners.forEach(listener => listener());

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should return cleanup function', () => {
      const callback = vi.fn();
      const cleanup = adapter.onVisibilityChange(callback);

      expect(typeof cleanup).toBe('function');
    });

    it('should remove listener when cleanup is called', () => {
      const callback = vi.fn();
      const cleanup = adapter.onVisibilityChange(callback);

      cleanup();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });
  });

  describe('dispose', () => {
    it('should remove event listener', () => {
      const callback = vi.fn();
      adapter.onVisibilityChange(callback);

      adapter.dispose();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should handle multiple dispose calls safely', () => {
      const callback = vi.fn();
      adapter.onVisibilityChange(callback);

      adapter.dispose();
      adapter.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
