/**
 * VisibilityAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('VisibilityAdapter', () => {
  let adapter;
  let visibilityChangeListeners;
  let hiddenMock;

  beforeEach(() => {
    visibilityChangeListeners = [];
    adapter = new VisibilityAdapter();
    hiddenMock = installDocumentPropertyMock('hidden', false);

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
    hiddenMock.cleanup();
    vi.restoreAllMocks();
  });

  describe('isHidden', () => {
    it('should return false when document is visible', () => {
      hiddenMock.setValue(false);
      expect(adapter.isHidden()).toBe(false);
    });

    it('should return true when document is hidden', () => {
      hiddenMock.setValue(true);
      expect(adapter.isHidden()).toBe(true);
    });
  });

  describe('onVisibilityChange', () => {
    it('should call callback when visibility changes', () => {
      const callback = vi.fn();
      adapter.onVisibilityChange(callback);

      // Simulate visibility change
      hiddenMock.setValue(true);
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
