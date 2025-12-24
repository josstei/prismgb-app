/**
 * CaptureUiBridge Unit Tests
 * Tests the event bridge between capture events and UI feedback
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureUiBridge } from '@renderer/ui/orchestration/capture-ui.bridge.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('CaptureUiBridge', () => {
  let bridge;
  let mockEventBus;
  let mockUIController;
  let mockLogger;
  let mockLoggerFactory;
  let subscribedHandlers;

  beforeEach(() => {
    // Track subscribed handlers
    subscribedHandlers = {};

    // Create mock EventBus
    mockEventBus = {
      subscribe: vi.fn((event, handlerFn) => {
        subscribedHandlers[event] = handlerFn;
        return vi.fn(); // Return unsubscribe function
      }),
      publish: vi.fn()
    };

    // Create mock UIController
    mockUIController = {
      triggerDownload: vi.fn()
    };

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should store eventBus', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.eventBus).toBe(mockEventBus);
    });

    it('should store uiController', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.uiController).toBe(mockUIController);
    });

    it('should create logger from loggerFactory', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('CaptureUiBridge');
      expect(bridge.logger).toBe(mockLogger);
    });

    it('should use console as fallback logger when loggerFactory is not provided', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: null
      });

      expect(bridge.logger).toBe(console);
    });

    it('should use console as fallback logger when loggerFactory is undefined', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController
      });

      expect(bridge.logger).toBe(console);
    });

    it('should initialize subscriptions array', () => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge._subscriptions).toEqual([]);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should subscribe to all capture events', () => {
      bridge.initialize();

      const expectedEvents = [
        EventChannels.CAPTURE.SCREENSHOT_TRIGGERED,
        EventChannels.CAPTURE.SCREENSHOT_READY,
        EventChannels.CAPTURE.RECORDING_STARTED,
        EventChannels.CAPTURE.RECORDING_STOPPED,
        EventChannels.CAPTURE.RECORDING_READY,
        EventChannels.CAPTURE.RECORDING_ERROR,
        EventChannels.CAPTURE.RECORDING_DEGRADED
      ];

      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should subscribe to all capture events', () => {
      bridge.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(7);
    });

    it('should store unsubscribe functions', () => {
      bridge.initialize();

      expect(bridge._subscriptions.length).toBe(7);
      bridge._subscriptions.forEach(unsub => {
        expect(typeof unsub).toBe('function');
      });
    });

    it('should log initialization', () => {
      bridge.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUiBridge initialized');
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call all unsubscribe functions', () => {
      bridge.initialize();

      const unsubscribeFns = bridge._subscriptions;
      bridge.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should clear subscriptions array', () => {
      bridge.initialize();
      bridge.dispose();

      expect(bridge._subscriptions).toEqual([]);
    });

    it('should log disposal', () => {
      bridge.initialize();
      bridge.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUiBridge disposed');
    });

    it('should handle non-function items in subscriptions array gracefully', () => {
      bridge.initialize();
      bridge._subscriptions.push(null, undefined, 'not-a-function');

      expect(() => bridge.dispose()).not.toThrow();
    });

    it('should work when called multiple times', () => {
      bridge.initialize();
      bridge.dispose();
      bridge.dispose();

      expect(bridge._subscriptions).toEqual([]);
    });
  });

  describe('Event Handlers - Screenshot', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should publish button feedback event when screenshot is triggered', () => {
      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_TRIGGERED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.BUTTON_FEEDBACK,
        {
          elementKey: 'screenshotBtn',
          className: 'capturing',
          duration: expect.any(Number)
        }
      );
    });

    it('should handle screenshot ready event', () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const filename = 'screenshot-2025-01-15-10-30-45.png';

      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockUIController.triggerDownload).toHaveBeenCalledWith(mockBlob, filename);
    });

    it('should publish status message after screenshot ready', () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const filename = 'screenshot-2025-01-15-10-30-45.png';

      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Screenshot saved!' }
      );
    });

    it('should call triggerDownload before publishing status message', () => {
      const mockBlob = new Blob(['test'], { type: 'image/png' });
      const filename = 'screenshot.png';

      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
        blob: mockBlob,
        filename: filename
      });

      const triggerDownloadCallIndex = mockUIController.triggerDownload.mock.invocationCallOrder[0];
      const publishCallIndex = mockEventBus.publish.mock.invocationCallOrder[0];

      expect(triggerDownloadCallIndex).toBeLessThan(publishCallIndex);
    });
  });

  describe('Event Handlers - Recording Started', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should publish record button pop event', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORD_BUTTON_POP
      );
    });

    it('should publish status message', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Recording started' }
      );
    });

    it('should publish recording state as active', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: true }
      );
    });

    it('should publish exactly 3 events', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(3);
    });

    it('should publish events in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish.mock.calls[0][0]).toBe(EventChannels.UI.RECORD_BUTTON_POP);
      expect(mockEventBus.publish.mock.calls[1][0]).toBe(EventChannels.UI.STATUS_MESSAGE);
      expect(mockEventBus.publish.mock.calls[2][0]).toBe(EventChannels.UI.RECORDING_STATE);
    });
  });

  describe('Event Handlers - Recording Stopped', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should publish record button press event', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORD_BUTTON_PRESS
      );
    });

    it('should publish recording state as inactive', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: false }
      );
    });

    it('should publish exactly 2 events', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
    });

    it('should publish events in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockEventBus.publish.mock.calls[0][0]).toBe(EventChannels.UI.RECORD_BUTTON_PRESS);
      expect(mockEventBus.publish.mock.calls[1][0]).toBe(EventChannels.UI.RECORDING_STATE);
    });
  });

  describe('Event Handlers - Recording Ready', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should handle recording ready event', () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording-2025-01-15-10-30-45.webm';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockUIController.triggerDownload).toHaveBeenCalledWith(mockBlob, filename);
    });

    it('should publish status message after recording ready', () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording-2025-01-15-10-30-45.webm';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Recording saved!' }
      );
    });

    it('should call triggerDownload before publishing status message', () => {
      const mockBlob = new Blob(['test'], { type: 'video/webm' });
      const filename = 'recording.webm';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_READY]({
        blob: mockBlob,
        filename: filename
      });

      const triggerDownloadCallIndex = mockUIController.triggerDownload.mock.invocationCallOrder[0];
      const publishCallIndex = mockEventBus.publish.mock.invocationCallOrder[0];

      expect(triggerDownloadCallIndex).toBeLessThan(publishCallIndex);
    });
  });

  describe('Event Handlers - Recording Error', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should log error message', () => {
      const errorMessage = 'Failed to encode video';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorMessage
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', errorMessage);
    });

    it('should publish recording state as inactive', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: false }
      );
    });

    it('should publish error status message', () => {
      const errorMessage = 'Failed to encode video';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorMessage
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        {
          message: `Recording failed: ${errorMessage}`,
          type: 'error'
        }
      );
    });

    it('should publish exactly 2 events', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
    });

    it('should publish events in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      expect(mockEventBus.publish.mock.calls[0][0]).toBe(EventChannels.UI.RECORDING_STATE);
      expect(mockEventBus.publish.mock.calls[1][0]).toBe(EventChannels.UI.STATUS_MESSAGE);
    });

    it('should handle error objects', () => {
      const errorObj = new Error('Encoding failed');

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorObj
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', errorObj);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        {
          message: `Recording failed: ${errorObj}`,
          type: 'error'
        }
      );
    });

    it('should handle empty error message', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: ''
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', '');
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        {
          message: 'Recording failed: ',
          type: 'error'
        }
      );
    });
  });

  describe('Event Handlers - Recording Degraded', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should log warning message with dropped frames', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_DEGRADED]({
        droppedFrames: 30
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Recording degraded:',
        'Recording quality degraded: 30 frames dropped'
      );
    });

    it('should publish warning status message with dropped frames', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_DEGRADED]({
        droppedFrames: 30
      });

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        {
          message: 'Recording quality degraded: 30 frames dropped',
          type: 'warning'
        }
      );
    });

    it('should publish exactly 1 event', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_DEGRADED]({
        droppedFrames: 30
      });

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration - Full Workflow', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
      bridge.initialize();
    });

    it('should handle complete screenshot workflow', () => {
      const mockBlob = new Blob(['screenshot data'], { type: 'image/png' });
      const filename = 'test-screenshot.png';

      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockUIController.triggerDownload).toHaveBeenCalledWith(mockBlob, filename);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Screenshot saved!' }
      );
    });

    it('should handle complete recording workflow', () => {
      const mockBlob = new Blob(['video data'], { type: 'video/webm' });
      const filename = 'test-recording.webm';

      // Start recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: true }
      );

      mockEventBus.publish.mockClear();

      // Stop recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: false }
      );

      mockEventBus.publish.mockClear();

      // Recording ready
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_READY]({
        blob: mockBlob,
        filename: filename
      });
      expect(mockUIController.triggerDownload).toHaveBeenCalledWith(mockBlob, filename);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Recording saved!' }
      );
    });

    it('should handle recording error workflow', () => {
      const errorMessage = 'Recording failed';

      // Start recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: true }
      );

      mockEventBus.publish.mockClear();
      mockLogger.error.mockClear();

      // Error occurs
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorMessage
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', errorMessage);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.RECORDING_STATE,
        { active: false }
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        {
          message: `Recording failed: ${errorMessage}`,
          type: 'error'
        }
      );
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should not throw when disposing before initialization', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect(bridge._subscriptions).toEqual([]);
    });

    it('should handle missing blob in screenshot ready', () => {
      bridge.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
          blob: undefined,
          filename: 'test.png'
        });
      }).not.toThrow();
    });

    it('should handle missing filename in screenshot ready', () => {
      bridge.initialize();
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
          blob: mockBlob,
          filename: undefined
        });
      }).not.toThrow();
    });

    it('should handle missing error in recording error', () => {
      bridge.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({});
      }).not.toThrow();
    });

    it('should work with console logger', () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bridge = new CaptureUiBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        loggerFactory: null
      });

      bridge.initialize();
      expect(consoleInfoSpy).toHaveBeenCalledWith('CaptureUiBridge initialized');

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'test error'
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Recording error:', 'test error');

      bridge.dispose();
      expect(consoleInfoSpy).toHaveBeenCalledWith('CaptureUiBridge disposed');

      consoleInfoSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
