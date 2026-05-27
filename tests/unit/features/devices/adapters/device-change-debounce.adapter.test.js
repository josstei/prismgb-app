/**
 * DeviceChangeDebounceAdapter Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DeviceChangeDebounceAdapter } from '@renderer/infrastructure/adapters/devices/device-change-debounce.adapter.ts';
import { createLogger, createBrowserMediaServiceMock } from '../../../../factories/index.js';

describe('DeviceChangeDebounceAdapter', () => {
  let adapter;
  let mockBrowserMediaService;
  let mockLogger;
  let eventHandler;

  beforeEach(() => {
    vi.useFakeTimers();

    mockBrowserMediaService = createBrowserMediaServiceMock({
      addEventListener: vi.fn((event, handler) => {
        eventHandler = handler;
      }),
      removeEventListener: vi.fn()
    });

    mockLogger = createLogger({ name: 'DeviceChangeDebounceAdapter' });

    adapter = new DeviceChangeDebounceAdapter({
      browserMediaService: mockBrowserMediaService,
      logger: mockLogger,
      debounceMs: 100 // Use shorter delay for tests
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should throw when browserMediaService is missing', () => {
      expect(() => new DeviceChangeDebounceAdapter({}))
        .toThrow('browserMediaService is required');
    });

    it('should accept custom debounce delay', () => {
      const customAdapter = new DeviceChangeDebounceAdapter({
        browserMediaService: mockBrowserMediaService,
        debounceMs: 500
      });
      expect(customAdapter).toBeDefined();
    });

    it('should work without logger', () => {
      const noLoggerAdapter = new DeviceChangeDebounceAdapter({
        browserMediaService: mockBrowserMediaService
      });
      expect(noLoggerAdapter).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should register event listener on browserMediaService', () => {
      adapter.subscribe(() => {});

      expect(mockBrowserMediaService.addEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });

    it('should return unsubscribe function', () => {
      const unsubscribe = adapter.subscribe(() => {});

      expect(typeof unsubscribe).toBe('function');
    });

    it('should call callback after debounce delay', () => {
      const callback = vi.fn();
      adapter.subscribe(callback);

      // Trigger device change
      eventHandler();

      // Not called immediately
      expect(callback).not.toHaveBeenCalled();

      // Advance timer past debounce
      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should warn on invalid callback', () => {
      const result = adapter.subscribe(null);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid callback')
      );
      expect(typeof result).toBe('function'); // Returns no-op unsubscribe
    });

    it('should warn on double subscription', () => {
      adapter.subscribe(() => {});
      adapter.subscribe(() => {});

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Already subscribed')
      );
    });

    it('should log registration', () => {
      adapter.subscribe(() => {});

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('listener registered')
      );
    });
  });

  describe('Debouncing behavior', () => {
    it('should suppress rapid events and call once', () => {
      const callback = vi.fn();
      adapter.subscribe(callback);

      // Fire 5 rapid events
      eventHandler();
      vi.advanceTimersByTime(20);
      eventHandler();
      vi.advanceTimersByTime(20);
      eventHandler();
      vi.advanceTimersByTime(20);
      eventHandler();
      vi.advanceTimersByTime(20);
      eventHandler();

      // Still within debounce window
      expect(callback).not.toHaveBeenCalled();

      // Advance past debounce
      vi.advanceTimersByTime(100);

      // Only called once
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should track suppressed event count', () => {
      adapter.subscribe(() => {});

      // Fire 3 rapid events
      eventHandler();
      eventHandler();
      eventHandler();

      expect(adapter.getSuppressedCount()).toBe(2); // First one isn't suppressed

      // After debounce, count resets
      vi.advanceTimersByTime(100);
      expect(adapter.getSuppressedCount()).toBe(0);
    });

    it('should log suppressed events', () => {
      adapter.subscribe(() => {});

      eventHandler();
      eventHandler();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('suppressed')
      );
    });

    it('should handle events after debounce window closes', () => {
      const callback = vi.fn();
      adapter.subscribe(callback);

      // First event
      eventHandler();
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(1);

      // Second event after debounce window
      eventHandler();
      vi.advanceTimersByTime(100);
      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribe', () => {
    it('should remove event listener', () => {
      adapter.subscribe(() => {});
      adapter.unsubscribe();

      expect(mockBrowserMediaService.removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function)
      );
    });

    it('should clear pending debounce timer', () => {
      const callback = vi.fn();
      adapter.subscribe(callback);

      // Trigger event
      eventHandler();

      // Unsubscribe before debounce completes
      adapter.unsubscribe();
      vi.advanceTimersByTime(100);

      // Callback should not have been called
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle unsubscribe when not subscribed', () => {
      expect(() => adapter.unsubscribe()).not.toThrow();
    });

    it('should log removal', () => {
      adapter.subscribe(() => {});
      adapter.unsubscribe();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('listener removed')
      );
    });
  });

  describe('Unsubscribe via returned function', () => {
    it('should unsubscribe when calling returned function', () => {
      const unsubscribe = adapter.subscribe(() => {});
      unsubscribe();

      expect(mockBrowserMediaService.removeEventListener).toHaveBeenCalled();
      expect(adapter.isSubscribed()).toBe(false);
    });
  });

  describe('isSubscribed', () => {
    it('should return false initially', () => {
      expect(adapter.isSubscribed()).toBe(false);
    });

    it('should return true after subscribing', () => {
      adapter.subscribe(() => {});
      expect(adapter.isSubscribed()).toBe(true);
    });

    it('should return false after unsubscribing', () => {
      adapter.subscribe(() => {});
      adapter.unsubscribe();
      expect(adapter.isSubscribed()).toBe(false);
    });
  });

  describe('getSuppressedCount', () => {
    it('should return 0 initially', () => {
      expect(adapter.getSuppressedCount()).toBe(0);
    });

    it('should count suppressed events', () => {
      adapter.subscribe(() => {});

      eventHandler();
      expect(adapter.getSuppressedCount()).toBe(0);

      eventHandler();
      expect(adapter.getSuppressedCount()).toBe(1);

      eventHandler();
      expect(adapter.getSuppressedCount()).toBe(2);
    });

    it('should reset after callback fires', () => {
      adapter.subscribe(() => {});

      eventHandler();
      eventHandler();
      eventHandler();
      expect(adapter.getSuppressedCount()).toBe(2);

      vi.advanceTimersByTime(100);
      expect(adapter.getSuppressedCount()).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle callback that throws', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      adapter.subscribe(errorCallback);
      eventHandler();

      // Should not throw, error is in callback
      expect(() => vi.advanceTimersByTime(100)).toThrow('Callback error');
    });

    it('should work without logger for suppression', () => {
      const noLoggerAdapter = new DeviceChangeDebounceAdapter({
        browserMediaService: mockBrowserMediaService,
        debounceMs: 100
      });

      let handler;
      mockBrowserMediaService.addEventListener.mockImplementation((event, h) => {
        handler = h;
      });

      noLoggerAdapter.subscribe(() => {});
      handler();
      handler();

      // Should not throw
      expect(noLoggerAdapter.getSuppressedCount()).toBe(1);
    });
  });
});
