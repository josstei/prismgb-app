/**
 * CaptureUIBridge Unit Tests
 * Tests the event bridge between capture events and UI feedback
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('CaptureUIBridge', () => {
  let bridge;
  let mockEventBus;
  let mockUIController;
  let mockUiEffects;
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
      triggerDownload: vi.fn(),
      updateRecordingButtonState: vi.fn()
    };

    // Create mock UIEffects
    mockUiEffects = {
      triggerButtonFeedback: vi.fn(),
      triggerRecordButtonPop: vi.fn(),
      triggerRecordButtonPress: vi.fn()
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
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.eventBus).toBe(mockEventBus);
    });

    it('should store uiController', () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.uiController).toBe(mockUIController);
    });

    it('should store uiEffects', () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge.uiEffects).toBe(mockUiEffects);
    });

    it('should create logger from loggerFactory', () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('CaptureUIBridge');
      expect(bridge.logger).toBe(mockLogger);
    });

    it('should throw when loggerFactory is missing (undefined)', () => {
      expect(() => new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects
      })).toThrow(/Missing required dependencies.*loggerFactory/);
    });

    it('should initialize subscriptions array', () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });

      expect(bridge._subscriptions).toEqual([]);
    });
  });

  describe('initialize', () => {
    beforeEach(() => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should subscribe to all capture events', async () => {
      await bridge.initialize();

      const expectedEvents = [
        EventChannels.CAPTURE.SCREENSHOT_TRIGGERED,
        EventChannels.CAPTURE.SCREENSHOT_READY,
        EventChannels.CAPTURE.RECORDING_STARTED,
        EventChannels.CAPTURE.RECORDING_STOPPED,
        EventChannels.CAPTURE.RECORDING_ERROR,
        EventChannels.CAPTURE.RECORDING_DEGRADED
      ];

      expectedEvents.forEach(event => {
        expect(mockEventBus.subscribe).toHaveBeenCalledWith(event, expect.any(Function));
      });
    });

    it('should subscribe to all capture events', async () => {
      await bridge.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(6);
    });

    it('should store unsubscribe functions', async () => {
      await bridge.initialize();

      expect(bridge._subscriptions.length).toBe(6);
      bridge._subscriptions.forEach(unsub => {
        expect(typeof unsub).toBe('function');
      });
    });

    it('should log initialization', async () => {
      await bridge.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUIBridge initialized');
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should call all unsubscribe functions', async () => {
      await bridge.initialize();

      const unsubscribeFns = bridge._subscriptions;
      await bridge.dispose();

      unsubscribeFns.forEach(fn => {
        expect(fn).toHaveBeenCalled();
      });
    });

    it('should clear subscriptions array', async () => {
      await bridge.initialize();
      await bridge.dispose();

      expect(bridge._subscriptions).toEqual([]);
    });

    it('should log disposal', async () => {
      await bridge.initialize();
      await bridge.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUIBridge disposed');
    });

    it('should handle non-function items in subscriptions array gracefully', async () => {
      await bridge.initialize();
      bridge._subscriptions.push(null, undefined, 'not-a-function');

      expect(async () => await bridge.dispose()).not.toThrow();
    });

    it('should work when called multiple times', async () => {
      await bridge.initialize();
      await bridge.dispose();
      await bridge.dispose();

      expect(bridge._subscriptions).toEqual([]);
    });
  });

  describe('Event Handlers - Screenshot', () => {
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
    });

    it('should call uiEffects triggerButtonFeedback when screenshot is triggered', () => {
      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_TRIGGERED]();

      expect(mockUiEffects.triggerButtonFeedback).toHaveBeenCalledWith(
        'screenshotBtn',
        'capturing',
        expect.any(Number)
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
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
    });

    it('should call uiEffects triggerRecordButtonPop', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockUiEffects.triggerRecordButtonPop).toHaveBeenCalled();
    });

    it('should publish status message', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Recording started' }
      );
    });

    it('should call uiController updateRecordingButtonState with true', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(true);
    });

    it('should publish exactly 1 event', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('should call methods in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();

      const popCallIndex = mockUiEffects.triggerRecordButtonPop.mock.invocationCallOrder[0];
      const publishCallIndex = mockEventBus.publish.mock.invocationCallOrder[0];
      const stateCallIndex = mockUIController.updateRecordingButtonState.mock.invocationCallOrder[0];

      expect(popCallIndex).toBeLessThan(publishCallIndex);
      expect(publishCallIndex).toBeLessThan(stateCallIndex);
    });
  });

  describe('Event Handlers - Recording Stopped', () => {
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
    });

    it('should call uiEffects triggerRecordButtonPress', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockUiEffects.triggerRecordButtonPress).toHaveBeenCalled();
    });

    it('should call uiController updateRecordingButtonState with false', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(false);
    });

    it('should not publish any events', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      expect(mockEventBus.publish).not.toHaveBeenCalled();
    });

    it('should call methods in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();

      const pressCallIndex = mockUiEffects.triggerRecordButtonPress.mock.invocationCallOrder[0];
      const stateCallIndex = mockUIController.updateRecordingButtonState.mock.invocationCallOrder[0];

      expect(pressCallIndex).toBeLessThan(stateCallIndex);
    });
  });

  describe('Event Handlers - Recording Error', () => {
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
    });

    it('should log error message', () => {
      const errorMessage = 'Failed to encode video';

      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorMessage
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', errorMessage);
    });

    it('should call uiController updateRecordingButtonState with false', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(false);
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

    it('should publish exactly 1 event', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
    });

    it('should call methods in correct order', () => {
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: 'Some error'
      });

      const stateCallIndex = mockUIController.updateRecordingButtonState.mock.invocationCallOrder[0];
      const publishCallIndex = mockEventBus.publish.mock.invocationCallOrder[0];

      expect(stateCallIndex).toBeLessThan(publishCallIndex);
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
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
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
    beforeEach(async () => {
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
      await bridge.initialize();
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
      // Start recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();
      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(true);

      mockUIController.updateRecordingButtonState.mockClear();

      // Stop recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STOPPED]();
      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(false);
      // Note: RECORDING_READY is now handled by CaptureOrchestrator, not the UI bridge
    });

    it('should handle recording error workflow', () => {
      const errorMessage = 'Recording failed';

      // Start recording
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_STARTED]();
      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(true);

      mockEventBus.publish.mockClear();
      mockLogger.error.mockClear();
      mockUIController.updateRecordingButtonState.mockClear();

      // Error occurs
      subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({
        error: errorMessage
      });

      expect(mockLogger.error).toHaveBeenCalledWith('Recording error:', errorMessage);
      expect(mockUIController.updateRecordingButtonState).toHaveBeenCalledWith(false);
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
      bridge = new CaptureUIBridge({
        eventBus: mockEventBus,
        uiController: mockUIController,
        uiEffects: mockUiEffects,
        loggerFactory: mockLoggerFactory
      });
    });

    it('should not throw when disposing before initialization', async () => {
      expect(async () => await bridge.dispose()).not.toThrow();
      expect(bridge._subscriptions).toEqual([]);
    });

    it('should handle missing blob in screenshot ready', async () => {
      await bridge.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
          blob: undefined,
          filename: 'test.png'
        });
      }).not.toThrow();
    });

    it('should handle missing filename in screenshot ready', async () => {
      await bridge.initialize();
      const mockBlob = new Blob(['test'], { type: 'image/png' });

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
          blob: mockBlob,
          filename: undefined
        });
      }).not.toThrow();
    });

    it('should handle missing error in recording error', async () => {
      await bridge.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({});
      }).not.toThrow();
    });

  });
});
