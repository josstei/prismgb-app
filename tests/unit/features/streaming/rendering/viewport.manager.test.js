/**
 * ViewportManager Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ViewportManager } from '@features/streaming/rendering/viewport.manager.js';

describe('ViewportManager', () => {
  let manager;
  let mockLogger;
  let mockCanvas;
  let mockContainer;
  let mockSection;
  let mockMainContent;

  beforeEach(() => {
    vi.useFakeTimers();

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockContainer = {};

    // mainContent is the stable parent used for measurement
    mockMainContent = {
      clientWidth: 800,
      clientHeight: 600
    };

    mockSection = {
      clientWidth: 800,
      clientHeight: 600,
      children: [mockContainer], // Only the container, no siblings
      parentElement: mockMainContent
    };

    mockContainer.parentElement = mockSection;

    mockCanvas = {
      width: 0,
      height: 0,
      parentElement: mockContainer
    };

    // Mock window.getComputedStyle
    global.window.getComputedStyle = vi.fn((element) => {
      if (element === mockSection) {
        return {
          paddingLeft: '10px',
          paddingRight: '10px',
          paddingTop: '10px',
          paddingBottom: '10px',
          gap: '0px'
        };
      }
      if (element === mockContainer) {
        return {
          borderLeftWidth: '2px',
          borderRightWidth: '2px',
          borderTopWidth: '2px',
          borderBottomWidth: '2px'
        };
      }
      return {};
    });

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn(function(callback) {
      this.observe = vi.fn();
      this.disconnect = vi.fn();
      this.callback = callback;
    });

    manager = new ViewportManager(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(manager._resizeObserver).toBeNull();
      expect(manager._resizeTimeout).toBeNull();
      expect(manager._onResizeCallback).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should create ResizeObserver and observe element', () => {
      const onResize = vi.fn();

      manager.initialize(mockSection, onResize);

      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(manager._resizeObserver.observe).toHaveBeenCalledWith(mockSection);
      expect(manager._onResizeCallback).toBe(onResize);
    });

    it('should log debug message', () => {
      const onResize = vi.fn();

      manager.initialize(mockSection, onResize);

      expect(mockLogger.debug).toHaveBeenCalledWith('ViewportManager initialized with ResizeObserver');
    });

    it('should not create observer if element is null', () => {
      const onResize = vi.fn();

      manager.initialize(null, onResize);

      expect(global.ResizeObserver).not.toHaveBeenCalled();
    });

    it('should not create observer if already exists', () => {
      const onResize = vi.fn();
      manager._resizeObserver = { observe: vi.fn() };

      manager.initialize(mockSection, onResize);

      expect(global.ResizeObserver).not.toHaveBeenCalled();
    });
  });

  describe('calculateDimensions', () => {
    it('should calculate pixel-perfect dimensions', () => {
      const nativeResolution = { width: 160, height: 144 };

      // Available space: 800 - 20 (padding) - 4 (border) = 776
      // Available height: 600 - 20 (padding) - 4 (border) = 576
      // Scale X: 776 / 160 = 4.85 -> floor = 4
      // Scale Y: 576 / 144 = 4 -> floor = 4
      // Scale: min(4, 4) = 4
      // Target: 160 * 4 = 640, 144 * 4 = 576

      const dimensions = manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toEqual({
        width: 640,
        height: 576,
        scale: 4
      });
    });

    it('should ensure minimum scale of 1', () => {
      const nativeResolution = { width: 1000, height: 1000 };

      const dimensions = manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions.scale).toBeGreaterThanOrEqual(1);
    });

    it('should return null if canvas is missing', () => {
      const nativeResolution = { width: 160, height: 144 };

      const dimensions = manager.calculateDimensions(null, nativeResolution);

      expect(dimensions).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot calculate dimensions - missing elements');
    });

    it('should return null if container is missing', () => {
      const nativeResolution = { width: 160, height: 144 };
      mockCanvas.parentElement = null;

      const dimensions = manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toBeNull();
    });

    it('should return null if section is missing', () => {
      const nativeResolution = { width: 160, height: 144 };
      mockContainer.parentElement = null;

      const dimensions = manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toBeNull();
    });

    it('should log debug message with dimensions', () => {
      const nativeResolution = { width: 160, height: 144 };

      manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(mockLogger.debug).toHaveBeenCalledWith('Calculated dimensions: 640x576 (4x scale, siblings: 0px, gap: 0px)');
    });

    it('should account for sibling elements and gap', () => {
      const nativeResolution = { width: 160, height: 144 };

      // Add a sibling element (e.g., controls)
      const mockControls = { offsetHeight: 50 };
      mockSection.children = [mockContainer, mockControls];

      // Update computed style to include gap
      global.window.getComputedStyle = vi.fn((element) => {
        if (element === mockSection) {
          return {
            paddingLeft: '10px',
            paddingRight: '10px',
            paddingTop: '10px',
            paddingBottom: '10px',
            gap: '24px'
          };
        }
        if (element === mockContainer) {
          return {
            borderLeftWidth: '2px',
            borderRightWidth: '2px',
            borderTopWidth: '2px',
            borderBottomWidth: '2px'
          };
        }
        return {};
      });

      // Available height: 600 - 20 (padding) - 4 (border) - 50 (sibling) - 24 (gap) = 502
      // Scale Y: 502 / 144 = 3.48 -> floor = 3
      // Scale: min(4, 3) = 3
      // Target: 160 * 3 = 480, 144 * 3 = 432

      const dimensions = manager.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toEqual({
        width: 480,
        height: 432,
        scale: 3
      });
    });
  });

  describe('_handleResize', () => {
    it('should debounce resize callback', () => {
      const onResize = vi.fn();
      manager._onResizeCallback = onResize;

      manager._handleResize();
      manager._handleResize();
      manager._handleResize();

      expect(onResize).not.toHaveBeenCalled();

      // Fast-forward past debounce delay
      vi.advanceTimersByTime(100);

      expect(onResize).toHaveBeenCalledTimes(1);
    });

    it('should not call callback if not set', () => {
      manager._onResizeCallback = null;

      manager._handleResize();
      vi.advanceTimersByTime(100);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should disconnect ResizeObserver', () => {
      const mockObserver = {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
      manager._resizeObserver = mockObserver;

      manager.cleanup();

      expect(mockObserver.disconnect).toHaveBeenCalled();
      expect(manager._resizeObserver).toBeNull();
    });

    it('should clear timeout', () => {
      manager._resizeTimeout = 123;

      manager.cleanup();

      expect(manager._resizeTimeout).toBeNull();
    });

    it('should clear callback', () => {
      manager._onResizeCallback = vi.fn();

      manager.cleanup();

      expect(manager._onResizeCallback).toBeNull();
    });

    it('should log debug message', () => {
      const mockObserver = {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
      manager._resizeObserver = mockObserver;

      manager.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('ResizeObserver disconnected');
    });

    it('should handle cleanup when observer is null', () => {
      manager._resizeObserver = null;

      manager.cleanup();

      expect(manager._resizeObserver).toBeNull();
    });
  });
});
