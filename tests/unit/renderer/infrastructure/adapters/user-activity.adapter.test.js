/**
 * UserActivityAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';

describe('UserActivityAdapter', () => {
  let adapter;
  let eventListeners;

  beforeEach(() => {
    eventListeners = {};
    adapter = new UserActivityAdapter();

    // Mock document.addEventListener
    vi.spyOn(document, 'addEventListener').mockImplementation((event, listener, options) => {
      if (!eventListeners[event]) {
        eventListeners[event] = [];
      }
      eventListeners[event].push({ listener, options });
    });

    vi.spyOn(document, 'removeEventListener');
  });

  afterEach(() => {
    adapter.dispose();
    vi.restoreAllMocks();
  });

  describe('onActivity', () => {
    it('should call callback on pointermove', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      // Simulate pointermove event
      const listeners = eventListeners['pointermove'];
      expect(listeners).toBeDefined();
      listeners[0].listener();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback on keydown', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      // Simulate keydown event
      const listeners = eventListeners['keydown'];
      expect(listeners).toBeDefined();
      listeners[0].listener();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback on wheel', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      // Simulate wheel event
      const listeners = eventListeners['wheel'];
      expect(listeners).toBeDefined();
      listeners[0].listener();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call callback on touchstart', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      // Simulate touchstart event
      const listeners = eventListeners['touchstart'];
      expect(listeners).toBeDefined();
      listeners[0].listener();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should register listeners with passive option', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      ['pointermove', 'keydown', 'wheel', 'touchstart'].forEach((event) => {
        const listeners = eventListeners[event];
        expect(listeners).toBeDefined();
        expect(listeners[0].options).toEqual({ passive: true });
      });
    });

    it('should return cleanup function', () => {
      const callback = vi.fn();
      const cleanup = adapter.onActivity(callback);

      expect(typeof cleanup).toBe('function');
    });

    it('should remove all listeners when cleanup is called', () => {
      const callback = vi.fn();
      const cleanup = adapter.onActivity(callback);

      cleanup();

      expect(document.removeEventListener).toHaveBeenCalledTimes(4);
      ['pointermove', 'keydown', 'wheel', 'touchstart'].forEach((event) => {
        expect(document.removeEventListener).toHaveBeenCalledWith(
          event,
          expect.any(Function),
          { passive: true }
        );
      });
    });
  });

  describe('dispose', () => {
    it('should remove all event listeners', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      adapter.dispose();

      expect(document.removeEventListener).toHaveBeenCalledTimes(4);
    });

    it('should handle multiple dispose calls safely', () => {
      const callback = vi.fn();
      adapter.onActivity(callback);

      adapter.dispose();
      adapter.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
