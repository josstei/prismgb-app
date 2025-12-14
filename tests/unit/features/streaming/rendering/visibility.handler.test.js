/**
 * VisibilityHandler Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VisibilityHandler } from '@features/streaming/rendering/visibility.handler.js';

describe('VisibilityHandler', () => {
  let handler;
  let mockLogger;
  let visibilityChangeListener;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    // Mock document.addEventListener to capture the listener
    document.addEventListener = vi.fn((event, listener) => {
      if (event === 'visibilitychange') {
        visibilityChangeListener = listener;
      }
    });
    document.removeEventListener = vi.fn();

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      value: false,
      writable: true,
      configurable: true
    });

    handler = new VisibilityHandler(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(handler._onVisible).toBeNull();
      expect(handler._onHidden).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should store callbacks and add event listener', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);

      expect(handler._onVisible).toBe(onVisible);
      expect(handler._onHidden).toBe(onHidden);
      expect(document.addEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should log debug message', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);

      expect(mockLogger.debug).toHaveBeenCalledWith('VisibilityHandler initialized');
    });
  });

  describe('_handleVisibilityChange', () => {
    it('should call onHidden when page becomes hidden', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);

      // Simulate page becoming hidden
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true
      });

      visibilityChangeListener();

      expect(mockLogger.debug).toHaveBeenCalledWith('Page hidden');
      expect(onHidden).toHaveBeenCalled();
      expect(onVisible).not.toHaveBeenCalled();
    });

    it('should call onVisible when page becomes visible', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);

      // Simulate page becoming visible
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true
      });

      visibilityChangeListener();

      expect(mockLogger.debug).toHaveBeenCalledWith('Page visible');
      expect(onVisible).toHaveBeenCalled();
      expect(onHidden).not.toHaveBeenCalled();
    });

    it('should not throw if callbacks are not set', () => {
      handler._onVisible = null;
      handler._onHidden = null;

      // Should not throw
      handler._handleVisibilityChange();

      expect(true).toBe(true);
    });
  });

  describe('isHidden', () => {
    it('should return true when page is hidden', () => {
      Object.defineProperty(document, 'hidden', {
        value: true,
        writable: true,
        configurable: true
      });

      expect(handler.isHidden()).toBe(true);
    });

    it('should return false when page is visible', () => {
      Object.defineProperty(document, 'hidden', {
        value: false,
        writable: true,
        configurable: true
      });

      expect(handler.isHidden()).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should remove event listener', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);
      handler.cleanup();

      expect(document.removeEventListener).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function)
      );
    });

    it('should clear callbacks', () => {
      const onVisible = vi.fn();
      const onHidden = vi.fn();

      handler.initialize(onVisible, onHidden);
      handler.cleanup();

      expect(handler._onVisible).toBeNull();
      expect(handler._onHidden).toBeNull();
    });

    it('should log debug message', () => {
      handler.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('VisibilityHandler cleaned up');
    });
  });
});
