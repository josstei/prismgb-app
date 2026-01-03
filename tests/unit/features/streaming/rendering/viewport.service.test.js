/**
 * StreamingViewportService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { StreamingViewportService } from '@renderer/features/streaming/rendering/streaming-viewport.service.js';

describe('StreamingViewportService', () => {
  let service;
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

    service = new StreamingViewportService(mockLogger);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(service._resizeObserver).toBeNull();
      expect(service._resizeTimeout).toBeNull();
      expect(service._onResizeCallback).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should create ResizeObserver and observe element', () => {
      const onResize = vi.fn();

      service.initialize(mockSection, onResize);

      expect(global.ResizeObserver).toHaveBeenCalled();
      expect(service._resizeObserver.observe).toHaveBeenCalledWith(mockSection);
      expect(service._onResizeCallback).toBe(onResize);
    });

    it('should log debug message', () => {
      const onResize = vi.fn();

      service.initialize(mockSection, onResize);

      expect(mockLogger.debug).toHaveBeenCalledWith('StreamingViewportService initialized with ResizeObserver');
    });

    it('should not create observer if element is null', () => {
      const onResize = vi.fn();

      service.initialize(null, onResize);

      expect(global.ResizeObserver).not.toHaveBeenCalled();
    });

    it('should not create observer if already exists', () => {
      const onResize = vi.fn();
      service._resizeObserver = { observe: vi.fn() };

      service.initialize(mockSection, onResize);

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

      const dimensions = service.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toEqual({
        width: 640,
        height: 576,
        scale: 4
      });
    });

    it('should ensure minimum scale of 1', () => {
      const nativeResolution = { width: 1000, height: 1000 };

      const dimensions = service.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions.scale).toBeGreaterThanOrEqual(1);
    });

    it('should return null if canvas is missing', () => {
      const nativeResolution = { width: 160, height: 144 };

      const dimensions = service.calculateDimensions(null, nativeResolution);

      expect(dimensions).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Cannot calculate dimensions - missing elements');
    });

    it('should return null if container is missing', () => {
      const nativeResolution = { width: 160, height: 144 };
      mockCanvas.parentElement = null;

      const dimensions = service.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toBeNull();
    });

    it('should return null if section is missing', () => {
      const nativeResolution = { width: 160, height: 144 };
      mockContainer.parentElement = null;

      const dimensions = service.calculateDimensions(mockCanvas, nativeResolution);

      expect(dimensions).toBeNull();
    });

    it('should log debug message with dimensions', () => {
      const nativeResolution = { width: 160, height: 144 };

      service.calculateDimensions(mockCanvas, nativeResolution);

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

      const dimensions = service.calculateDimensions(mockCanvas, nativeResolution);

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
      service._onResizeCallback = onResize;

      service._handleResize();
      service._handleResize();
      service._handleResize();

      expect(onResize).not.toHaveBeenCalled();

      // Fast-forward past debounce delay
      vi.advanceTimersByTime(100);

      expect(onResize).toHaveBeenCalledTimes(1);
    });

    it('should not call callback if not set', () => {
      service._onResizeCallback = null;

      service._handleResize();
      vi.advanceTimersByTime(100);

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('resetDimensions', () => {
    it('should clear last dimensions', () => {
      service._lastDimensions = { width: 640, height: 576, scale: 4 };

      service.resetDimensions();

      expect(service._lastDimensions).toBeNull();
    });
  });

  describe('forceResize', () => {
    it('should set forceResizePending flag', () => {
      service.forceResize();

      expect(service._forceResizePending).toBe(true);
    });

    it('should reset cached dimensions and styles', () => {
      service._lastDimensions = { width: 640, height: 576, scale: 4 };
      service._cachedStyles = { paddingX: 20 };

      service.forceResize();

      expect(service._lastDimensions).toBeNull();
      expect(service._cachedStyles).toBeNull();
    });

    it('should call callback after delay', () => {
      const onResize = vi.fn();
      service._onResizeCallback = onResize;

      service.forceResize();

      expect(onResize).not.toHaveBeenCalled();

      vi.advanceTimersByTime(32);

      expect(onResize).toHaveBeenCalledTimes(1);
      expect(service._forceResizePending).toBe(false);
    });

    it('should cancel pending resize timeout', () => {
      service._resizeTimeout = setTimeout(() => {}, 1000);

      service.forceResize();

      expect(service._resizeTimeout).toBeNull();
    });

    it('should cancel previous forceResize timeout', () => {
      const onResize = vi.fn();
      service._onResizeCallback = onResize;

      service.forceResize();
      service.forceResize();

      vi.advanceTimersByTime(32);

      expect(onResize).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup', () => {
    it('should disconnect ResizeObserver', () => {
      const mockObserver = {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
      service._resizeObserver = mockObserver;

      service.cleanup();

      expect(mockObserver.disconnect).toHaveBeenCalled();
      expect(service._resizeObserver).toBeNull();
    });

    it('should clear timeout', () => {
      service._resizeTimeout = 123;

      service.cleanup();

      expect(service._resizeTimeout).toBeNull();
    });

    it('should clear callback', () => {
      service._onResizeCallback = vi.fn();

      service.cleanup();

      expect(service._onResizeCallback).toBeNull();
    });

    it('should log debug message', () => {
      const mockObserver = {
        observe: vi.fn(),
        disconnect: vi.fn()
      };
      service._resizeObserver = mockObserver;

      service.cleanup();

      expect(mockLogger.debug).toHaveBeenCalledWith('ResizeObserver disconnected');
    });

    it('should handle cleanup when observer is null', () => {
      service._resizeObserver = null;

      service.cleanup();

      expect(service._resizeObserver).toBeNull();
    });
  });
});
