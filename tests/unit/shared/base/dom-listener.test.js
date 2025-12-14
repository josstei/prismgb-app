/**
 * DOM Listener Manager Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDomListenerManager } from '@/shared/base/dom-listener.js';

describe('DomListenerManager', () => {
  let manager;
  let mockLogger;
  let mockElement;

  beforeEach(() => {
    mockLogger = {
      warn: vi.fn()
    };
    mockElement = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    manager = createDomListenerManager({ logger: mockLogger });
  });

  describe('add', () => {
    it('should add event listener to target', () => {
      const handler = vi.fn();
      manager.add(mockElement, 'click', handler);

      expect(mockElement.addEventListener).toHaveBeenCalledWith('click', handler, undefined);
      expect(manager.count()).toBe(1);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsubscribe = manager.add(mockElement, 'click', handler);

      expect(typeof unsubscribe).toBe('function');
      expect(manager.count()).toBe(1);

      unsubscribe();

      expect(mockElement.removeEventListener).toHaveBeenCalledWith('click', handler, undefined);
      expect(manager.count()).toBe(0);
    });

    it('should handle null target gracefully', () => {
      const handler = vi.fn();
      const unsubscribe = manager.add(null, 'click', handler);

      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot add listener: target is null for "click"');
      expect(typeof unsubscribe).toBe('function');
      expect(manager.count()).toBe(0);

      // Unsubscribe should be safe to call
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should pass options to addEventListener', () => {
      const handler = vi.fn();
      const opts = { capture: true, passive: true };
      manager.add(mockElement, 'scroll', handler, opts);

      expect(mockElement.addEventListener).toHaveBeenCalledWith('scroll', handler, opts);
    });
  });

  describe('removeAll', () => {
    it('should remove all tracked listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      manager.add(mockElement, 'click', handler1);
      manager.add(mockElement, 'keydown', handler2);

      expect(manager.count()).toBe(2);

      manager.removeAll();

      expect(mockElement.removeEventListener).toHaveBeenCalledTimes(2);
      expect(manager.count()).toBe(0);
    });

    it('should handle errors during removal gracefully', () => {
      const handler = vi.fn();
      const badElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(() => {
          throw new Error('DOM error');
        })
      };

      manager.add(badElement, 'click', handler);

      // Should not throw
      expect(() => manager.removeAll()).not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(manager.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return 0 when no listeners', () => {
      expect(manager.count()).toBe(0);
    });

    it('should return correct count after adding listeners', () => {
      manager.add(mockElement, 'click', vi.fn());
      manager.add(mockElement, 'keydown', vi.fn());
      manager.add(mockElement, 'scroll', vi.fn());

      expect(manager.count()).toBe(3);
    });
  });

  describe('removeByTarget', () => {
    it('should remove all listeners for a specific target', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const otherElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      manager.add(mockElement, 'click', handler1);
      manager.add(mockElement, 'keydown', handler2);
      manager.add(otherElement, 'scroll', vi.fn());

      expect(manager.count()).toBe(3);

      const removed = manager.removeByTarget(mockElement);

      expect(removed).toBe(2);
      expect(mockElement.removeEventListener).toHaveBeenCalledTimes(2);
      expect(manager.count()).toBe(1); // Only otherElement listener remains
    });

    it('should return 0 when target has no listeners', () => {
      const otherElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      };

      manager.add(mockElement, 'click', vi.fn());

      const removed = manager.removeByTarget(otherElement);

      expect(removed).toBe(0);
      expect(manager.count()).toBe(1);
    });

    it('should handle errors during removal gracefully', () => {
      const handler = vi.fn();
      const badElement = {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(() => {
          throw new Error('DOM error');
        })
      };

      manager.add(badElement, 'click', handler);

      // Should not throw and should still remove from tracking
      const removed = manager.removeByTarget(badElement);
      expect(removed).toBe(0); // Count only increments on successful removal
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(manager.count()).toBe(0); // Entry still removed from tracking
    });
  });

  describe('without logger', () => {
    it('should work without logger', () => {
      const managerNoLogger = createDomListenerManager();
      const handler = vi.fn();

      // Should not throw
      expect(() => managerNoLogger.add(null, 'click', handler)).not.toThrow();
      expect(managerNoLogger.count()).toBe(0);
    });
  });
});
