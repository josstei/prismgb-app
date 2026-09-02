/**
 * CaptureUIBridge Unit Tests
 * Tests the event bridge between capture events and UI feedback
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockDownloadFile } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn()
}));

vi.mock('@renderer/lib/file-download.utils', () => ({
  downloadFile: mockDownloadFile
}));

import { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import { EventChannels } from '@platform/events';
import {
  createEventBus
} from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('CaptureUIBridge', () => {
  let bridge;
  let mockEventBus;
  let mockLogger;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};

    const h = createInjectableHarness(CaptureUIBridge, {
      overrides: {
        eventBus: createEventBus({
          onSubscribe: (event, handlerFn) => {
            subscribedHandlers[event] = handlerFn;
          },
        })
      }
    });
    bridge = h.subject;
    mockLogger = h.logger;
    ({ eventBus: mockEventBus } = h.deps);
    mockDownloadFile.mockClear();
  });

  describe('initialize', () => {
    it('should subscribe to all capture events', () => {
      bridge.initialize();

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

    it('should subscribe to all capture events', () => {
      bridge.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(6);
    });

    it('should store unsubscribe functions in disposables bag', () => {
      bridge.initialize();

      expect(bridge.disposables.size).toBe(6);
    });

    it('should log initialization', () => {
      bridge.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUIBridge initialized');
    });
  });

  describe('dispose', () => {
    it('should call all unsubscribe functions on dispose', () => {
      const unsubscribers = [];
      mockEventBus.subscribe.mockImplementation(() => {
        const unsub = vi.fn();
        unsubscribers.push(unsub);
        return unsub;
      });

      bridge.initialize();
      bridge.dispose();

      expect(unsubscribers.length).toBe(6);
      unsubscribers.forEach(unsub => {
        expect(unsub).toHaveBeenCalled();
      });
    });

    it('should log disposal', () => {
      bridge.initialize();
      bridge.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('CaptureUIBridge disposed');
    });
  });

  describe('Event Handlers - Screenshot', () => {
    beforeEach(() => {
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

      expect(mockDownloadFile).toHaveBeenCalledWith(mockBlob, filename);
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

      const triggerDownloadCallIndex = mockDownloadFile.mock.invocationCallOrder[0];
      const publishCallIndex = mockEventBus.publish.mock.invocationCallOrder[0];

      expect(triggerDownloadCallIndex).toBeLessThan(publishCallIndex);
    });
  });

  describe('Event Handlers - Recording Started', () => {
    beforeEach(() => {
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

  describe('Event Handlers - Recording Error', () => {
    beforeEach(() => {
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
      bridge.initialize();
    });

    it('should handle complete screenshot workflow', () => {
      const mockBlob = new Blob(['screenshot data'], { type: 'image/png' });
      const filename = 'test-screenshot.png';

      subscribedHandlers[EventChannels.CAPTURE.SCREENSHOT_READY]({
        blob: mockBlob,
        filename: filename
      });

      expect(mockDownloadFile).toHaveBeenCalledWith(mockBlob, filename);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Screenshot saved!' }
      );
    });

    it('should handle complete recording workflow', () => {
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
      // Note: RECORDING_READY is now handled by CaptureOrchestrator, not the UI bridge
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
    it('should not throw when disposing before initialization', () => {
      expect(() => bridge.dispose()).not.toThrow();
      expect(bridge.disposables.size).toBe(0);
    });

    it('should handle missing error in recording error', () => {
      bridge.initialize();

      expect(() => {
        subscribedHandlers[EventChannels.CAPTURE.RECORDING_ERROR]({});
      }).not.toThrow();
    });

  });
});
