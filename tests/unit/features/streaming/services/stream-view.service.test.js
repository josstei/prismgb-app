/**
 * StreamViewService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamViewService } from '@renderer/features/streaming/services/stream-view.service.js';

describe('StreamViewService', () => {
  let service;
  let mockUIController;
  let mockVideoElement;
  let mockLogger;
  let mockLoggerFactory;

  let mockCanvasElement;
  let mockContainerElement;
  let mockSectionElement;

  beforeEach(() => {
    mockVideoElement = {
      muted: false,
      srcObject: null,
      pause: vi.fn(),
      load: vi.fn()
    };

    mockSectionElement = document.createElement('section');
    mockContainerElement = document.createElement('div');
    mockCanvasElement = document.createElement('canvas');

    mockContainerElement.appendChild(mockCanvasElement);
    mockSectionElement.appendChild(mockContainerElement);

    mockUIController = {
      elements: {
        streamVideo: mockVideoElement,
        streamCanvas: mockCanvasElement
      },
      setStreamCanvas: vi.fn((canvas) => {
        mockUIController.elements.streamCanvas = canvas;
      })
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    service = new StreamViewService({
      uiController: mockUIController,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('Constructor', () => {
    it('should initialize with required dependencies', () => {
      expect(service.uiController).toBe(mockUIController);
      expect(service.logger).toBeDefined();
    });

    it('should create logger with correct name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('StreamViewService');
    });
  });

  describe('attachStream', () => {
    it('should attach stream to video element', () => {
      const mockStream = { id: 'test-stream' };

      service.attachStream(mockStream);

      expect(mockVideoElement.srcObject).toBe(mockStream);
    });

    it('should mute video element (audio handled by Web Audio)', () => {
      const mockStream = { id: 'test-stream' };
      mockVideoElement.muted = false;

      service.attachStream(mockStream);

      expect(mockVideoElement.muted).toBe(true);
    });

    it('should log info when stream attached', () => {
      const mockStream = { id: 'test-stream' };

      service.attachStream(mockStream);

      expect(mockLogger.info).toHaveBeenCalledWith('Stream assigned to video element');
    });

    it('should warn if video element not found', () => {
      mockUIController.elements.streamVideo = null;
      const mockStream = { id: 'test-stream' };

      service.attachStream(mockStream);

      expect(mockLogger.warn).toHaveBeenCalledWith('Stream video element not found');
    });

    it('should not throw if video element is null', () => {
      mockUIController.elements.streamVideo = null;
      const mockStream = { id: 'test-stream' };

      expect(() => service.attachStream(mockStream)).not.toThrow();
    });

    it('should not throw if video element is undefined', () => {
      mockUIController.elements.streamVideo = undefined;
      const mockStream = { id: 'test-stream' };

      expect(() => service.attachStream(mockStream)).not.toThrow();
    });
  });

  describe('clearStream', () => {
    it('should clear video srcObject', () => {
      mockVideoElement.srcObject = { id: 'test-stream' };

      service.clearStream();

      expect(mockVideoElement.srcObject).toBeNull();
    });

    it('should pause video before clearing', () => {
      mockVideoElement.srcObject = { id: 'test-stream' };

      service.clearStream();

      expect(mockVideoElement.pause).toHaveBeenCalled();
    });

    it('should call load() after clearing srcObject', () => {
      mockVideoElement.srcObject = { id: 'test-stream' };

      service.clearStream();

      expect(mockVideoElement.load).toHaveBeenCalled();
    });

    it('should log info when stream cleared', () => {
      mockVideoElement.srcObject = { id: 'test-stream' };

      service.clearStream();

      expect(mockLogger.info).toHaveBeenCalledWith('Video element srcObject cleared and reset');
    });

    it('should not clear if srcObject is already null', () => {
      mockVideoElement.srcObject = null;

      service.clearStream();

      expect(mockVideoElement.pause).not.toHaveBeenCalled();
      expect(mockVideoElement.load).not.toHaveBeenCalled();
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should warn if video element not found', () => {
      mockUIController.elements.streamVideo = null;

      service.clearStream();

      expect(mockLogger.warn).toHaveBeenCalledWith('Stream video element not found');
    });

    it('should not throw if video element is null', () => {
      mockUIController.elements.streamVideo = null;

      expect(() => service.clearStream()).not.toThrow();
    });

    it('should handle clearing when srcObject is undefined', () => {
      mockVideoElement.srcObject = undefined;

      service.clearStream();

      expect(mockVideoElement.pause).not.toHaveBeenCalled();
    });
  });

  describe('setMuted', () => {
    it('should mute video element', () => {
      mockVideoElement.muted = false;

      service.setMuted(true);

      expect(mockVideoElement.muted).toBe(true);
    });

    it('should unmute video element', () => {
      mockVideoElement.muted = true;

      service.setMuted(false);

      expect(mockVideoElement.muted).toBe(false);
    });

    it('should convert truthy values to boolean true', () => {
      service.setMuted('yes');
      expect(mockVideoElement.muted).toBe(true);

      service.setMuted(1);
      expect(mockVideoElement.muted).toBe(true);

      service.setMuted({});
      expect(mockVideoElement.muted).toBe(true);
    });

    it('should convert falsy values to boolean false', () => {
      service.setMuted(0);
      expect(mockVideoElement.muted).toBe(false);

      service.setMuted('');
      expect(mockVideoElement.muted).toBe(false);

      service.setMuted(null);
      expect(mockVideoElement.muted).toBe(false);

      service.setMuted(undefined);
      expect(mockVideoElement.muted).toBe(false);
    });

    it('should warn if video element not found', () => {
      mockUIController.elements.streamVideo = null;

      service.setMuted(true);

      expect(mockLogger.warn).toHaveBeenCalledWith('Stream video element not found');
    });

    it('should not throw if video element is null', () => {
      mockUIController.elements.streamVideo = null;

      expect(() => service.setMuted(true)).not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle full stream lifecycle', () => {
      const mockStream = { id: 'test-stream' };

      // Attach stream
      service.attachStream(mockStream);
      expect(mockVideoElement.srcObject).toBe(mockStream);
      expect(mockVideoElement.muted).toBe(true);

      // Change mute state
      service.setMuted(false);
      expect(mockVideoElement.muted).toBe(false);

      // Clear stream
      service.clearStream();
      expect(mockVideoElement.srcObject).toBeNull();
      expect(mockVideoElement.pause).toHaveBeenCalled();
      expect(mockVideoElement.load).toHaveBeenCalled();
    });

    it('should handle multiple stream attachments', () => {
      const stream1 = { id: 'stream-1' };
      const stream2 = { id: 'stream-2' };

      service.attachStream(stream1);
      expect(mockVideoElement.srcObject).toBe(stream1);

      service.attachStream(stream2);
      expect(mockVideoElement.srcObject).toBe(stream2);
    });

    it('should safely handle clearStream when no stream attached', () => {
      expect(mockVideoElement.srcObject).toBeNull();

      expect(() => service.clearStream()).not.toThrow();
      expect(mockVideoElement.pause).not.toHaveBeenCalled();
    });
  });

  describe('getVideo', () => {
    it('should return video element when available', () => {
      const result = service.getVideo();
      expect(result).toBe(mockVideoElement);
    });

    it('should return null and warn when video element not found', () => {
      mockUIController.elements.streamVideo = null;

      const result = service.getVideo();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Stream video element not found');
    });

    it('should return null when video element is undefined', () => {
      mockUIController.elements.streamVideo = undefined;

      const result = service.getVideo();

      expect(result).toBeNull();
    });
  });

  describe('getCanvas', () => {
    it('should return canvas element when available', () => {
      const result = service.getCanvas();
      expect(result).toBe(mockCanvasElement);
    });

    it('should return null and warn when canvas element not found', () => {
      mockUIController.elements.streamCanvas = null;

      const result = service.getCanvas();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Stream canvas element not found');
    });

    it('should return null when canvas element is undefined', () => {
      mockUIController.elements.streamCanvas = undefined;

      const result = service.getCanvas();

      expect(result).toBeNull();
    });
  });

  describe('getCanvasContainer', () => {
    it('should return canvas parent element when available', () => {
      const result = service.getCanvasContainer();
      expect(result).toBe(mockContainerElement);
    });

    it('should return null when canvas element not found', () => {
      mockUIController.elements.streamCanvas = null;

      const result = service.getCanvasContainer();

      expect(result).toBeNull();
    });

    it('should return null and warn when canvas has no parent', () => {
      // Create orphan canvas
      const orphanCanvas = document.createElement('canvas');
      mockUIController.elements.streamCanvas = orphanCanvas;

      const result = service.getCanvasContainer();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Canvas container element not found');
    });
  });

  describe('getCanvasSection', () => {
    it('should return container parent element when available', () => {
      const result = service.getCanvasSection();
      expect(result).toBe(mockSectionElement);
    });

    it('should return null when canvas element not found', () => {
      mockUIController.elements.streamCanvas = null;

      const result = service.getCanvasSection();

      expect(result).toBeNull();
    });

    it('should return null when container has no parent', () => {
      // Create canvas with only one level of parent
      const container = document.createElement('div');
      const canvas = document.createElement('canvas');
      container.appendChild(canvas);
      mockUIController.elements.streamCanvas = canvas;

      const result = service.getCanvasSection();

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Canvas section element not found');
    });
  });

  describe('setCanvas', () => {
    it('should update canvas element reference', () => {
      const newCanvas = document.createElement('canvas');

      service.setCanvas(newCanvas);

      expect(mockUIController.elements.streamCanvas).toBe(newCanvas);
      expect(mockLogger.info).toHaveBeenCalledWith('Canvas element reference updated');
    });

    it('should warn and not update when null provided', () => {
      const originalCanvas = mockUIController.elements.streamCanvas;

      service.setCanvas(null);

      expect(mockUIController.elements.streamCanvas).toBe(originalCanvas);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid canvas element provided to setCanvas');
    });

    it('should warn and not update when undefined provided', () => {
      const originalCanvas = mockUIController.elements.streamCanvas;

      service.setCanvas(undefined);

      expect(mockUIController.elements.streamCanvas).toBe(originalCanvas);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid canvas element provided to setCanvas');
    });

    it('should warn and not update when non-canvas element provided', () => {
      const originalCanvas = mockUIController.elements.streamCanvas;
      const divElement = document.createElement('div');

      service.setCanvas(divElement);

      expect(mockUIController.elements.streamCanvas).toBe(originalCanvas);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid canvas element provided to setCanvas');
    });
  });
});
