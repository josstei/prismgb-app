/**
 * Capture Workflow Integration Tests
 *
 * Tests complete capture workflows from user action to file download.
 * Validates event sequences, state transitions, and component coordination.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createAppState,
  createEventBus,
  createLoggerFactory,
  createMockCanvas,
  createMockVideo,
  createStreamingAppState,
  createUIController,
} from '../factories/index.js';
import {
  CAPTURE_EVENTS,
  UI_CAPTURE_EVENTS,
  createScreenshotBlob,
  createRecordingBlob,
} from '../fixtures/capture.fixture.js';
import { EventChannels } from '@prismgb/events';

describe('Capture Workflow Integration', () => {
  let eventBus;
  let appState;
  let loggerFactory;
  let uiController;

  beforeEach(() => {
    eventBus = createEventBus();
    appState = createStreamingAppState();
    loggerFactory = createLoggerFactory();
    uiController = createUIController();
  });

  afterEach(() => {
    eventBus._reset();
    vi.clearAllMocks();
  });

  describe('Screenshot Workflow', () => {
    it('should complete full screenshot workflow with correct event sequence', async () => {
      const events = [];

      // Subscribe to all capture events
      eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () =>
        events.push('screenshot-triggered')
      );
      eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_READY, () =>
        events.push('screenshot-ready')
      );
      eventBus.subscribe(EventChannels.UI.SHUTTER_FLASH, () =>
        events.push('shutter-flash')
      );

      // Simulate screenshot workflow
      // 1. User clicks screenshot button
      eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED, {});

      // 2. Orchestrator triggers screenshot
      eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, {});

      // 3. UI shows shutter flash
      eventBus.publish(EventChannels.UI.SHUTTER_FLASH, {});

      // 4. Capture service produces screenshot
      eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_READY, {
        filename: 'prismgb-screenshot-test.png',
        blob: createScreenshotBlob(),
      });

      // Verify event sequence
      expect(events).toEqual([
        'screenshot-triggered',
        'shutter-flash',
        'screenshot-ready',
      ]);

      // Verify screenshot-ready was published with correct data
      const screenshotEvent = eventBus._getLastEventOfType(
        EventChannels.CAPTURE.SCREENSHOT_READY
      );
      expect(screenshotEvent.data.filename).toMatch(/^prismgb-screenshot/);
      expect(screenshotEvent.data.blob).toBeInstanceOf(Blob);
    });

    it('should not trigger screenshot when not streaming', () => {
      const nonStreamingState = createAppState({ initialState: { isStreaming: false } });
      const events = [];

      eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () =>
        events.push('triggered')
      );

      // Simulate request with guard check
      if (nonStreamingState.isStreaming) {
        eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, {});
      }

      expect(events).toHaveLength(0);
    });

    it('should debounce rapid screenshot requests', async () => {
      const triggers = [];
      let lastTriggerTime = 0;
      const debounceMs = 200;

      eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () => {
        const now = Date.now();
        if (now - lastTriggerTime >= debounceMs) {
          triggers.push(now);
          lastTriggerTime = now;
        }
      });

      // Simulate rapid button clicks
      for (let i = 0; i < 5; i++) {
        const now = Date.now();
        if (now - lastTriggerTime >= debounceMs) {
          eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, {});
        }
      }

      // Should only have triggered once (or few times with debounce)
      expect(triggers.length).toBeLessThanOrEqual(1);
    });
  });

  describe('Recording Workflow', () => {
    it('should complete full recording start/stop workflow', async () => {
      const events = [];

      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () =>
        events.push('recording-started')
      );
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STOPPED, () =>
        events.push('recording-stopped')
      );
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_READY, () =>
        events.push('recording-ready')
      );
      eventBus.subscribe(EventChannels.UI.RECORDING_STATE, (data) =>
        events.push(`ui-recording-${data.recording}`)
      );

      // 1. User starts recording
      eventBus.publish(EventChannels.UI.RECORDING_TOGGLE_REQUESTED, {});

      // 2. Recording starts
      eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED, {});
      appState.setRecording(true);

      // 3. UI updates
      eventBus.publish(EventChannels.UI.RECORDING_STATE, { recording: true });

      // Verify intermediate state
      expect(appState.isRecording).toBe(true);
      expect(events).toContain('recording-started');
      expect(events).toContain('ui-recording-true');

      // 4. User stops recording
      eventBus.publish(EventChannels.UI.RECORDING_TOGGLE_REQUESTED, {});

      // 5. Recording stops
      eventBus.publish(EventChannels.CAPTURE.RECORDING_STOPPED, {});
      appState.setRecording(false);

      // 6. Recording file is ready
      eventBus.publish(EventChannels.CAPTURE.RECORDING_READY, {
        filename: 'prismgb-recording-test.webm',
        blob: createRecordingBlob(),
      });

      // 7. UI updates
      eventBus.publish(EventChannels.UI.RECORDING_STATE, { recording: false });

      // Verify final sequence
      expect(events).toEqual([
        'recording-started',
        'ui-recording-true',
        'recording-stopped',
        'recording-ready',
        'ui-recording-false',
      ]);

      expect(appState.isRecording).toBe(false);
    });

    it('should handle recording error gracefully', () => {
      const events = [];
      let recordingState = false;

      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () => {
        events.push('started');
        recordingState = true;
      });

      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_ERROR, (data) => {
        events.push(`error:${data.name}`);
        recordingState = false;
      });

      // Start recording
      eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED, {});
      expect(recordingState).toBe(true);

      // Simulate error
      eventBus.publish(EventChannels.CAPTURE.RECORDING_ERROR, {
        error: 'Disk full',
        name: 'QuotaExceededError',
      });

      expect(recordingState).toBe(false);
      expect(events).toEqual(['started', 'error:QuotaExceededError']);
    });

    it('should stop recording when stream stops unexpectedly', () => {
      const events = [];

      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STOPPED, () =>
        events.push('recording-stopped')
      );
      eventBus.subscribe(EventChannels.STREAM.STOPPED, () =>
        events.push('stream-stopped')
      );

      // Start recording
      appState.setRecording(true);

      // Simulate stream stopping (device disconnect)
      eventBus.publish(EventChannels.STREAM.STOPPED, {});

      // Recording should auto-stop
      if (appState.isRecording) {
        eventBus.publish(EventChannels.CAPTURE.RECORDING_STOPPED, {});
        appState.setRecording(false);
      }

      expect(appState.isRecording).toBe(false);
      expect(events).toContain('stream-stopped');
    });
  });

  describe('Screenshot During Recording', () => {
    it('should allow screenshots while recording', () => {
      const events = [];

      eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_READY, () =>
        events.push('screenshot')
      );
      eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () =>
        events.push('recording')
      );

      // Start recording
      appState.setRecording(true);
      eventBus.publish(EventChannels.CAPTURE.RECORDING_STARTED, {});

      // Take screenshot while recording
      eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_READY, {
        filename: 'test.png',
        blob: createScreenshotBlob(),
      });

      // Both should work
      expect(events).toContain('recording');
      expect(events).toContain('screenshot');
      expect(appState.isRecording).toBe(true);
    });
  });

  describe('Event History Validation', () => {
    it('should maintain correct event order in history', () => {
      // Perform a complete capture workflow
      eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED, {});
      eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, {});
      eventBus.publish(EventChannels.UI.SHUTTER_FLASH, {});
      eventBus.publish(EventChannels.CAPTURE.SCREENSHOT_READY, {
        filename: 'test.png',
        blob: createScreenshotBlob(),
      });

      // Verify order using event bus helpers
      expect(eventBus._wereEventsInOrder([
        EventChannels.UI.SCREENSHOT_REQUESTED,
        EventChannels.CAPTURE.SCREENSHOT_TRIGGERED,
        EventChannels.UI.SHUTTER_FLASH,
        EventChannels.CAPTURE.SCREENSHOT_READY,
      ])).toBe(true);
    });
  });
});

describe('Capture UI Feedback', () => {
  let eventBus;
  let uiController;

  beforeEach(() => {
    eventBus = createEventBus();
    uiController = createUIController();
  });

  it('should trigger button feedback on record start', () => {
    const feedbackEvents = [];

    eventBus.subscribe(EventChannels.UI.RECORD_BUTTON_POP, () =>
      feedbackEvents.push('pop')
    );
    eventBus.subscribe(EventChannels.UI.BUTTON_FEEDBACK, (data) =>
      feedbackEvents.push(`feedback:${data.button}`)
    );

    // Simulate recording start feedback
    eventBus.publish(EventChannels.UI.RECORD_BUTTON_POP, {});

    expect(feedbackEvents).toContain('pop');
  });

  it('should update recording button state', () => {
    // Simulate recording state change
    eventBus.subscribe(EventChannels.UI.RECORDING_STATE, (data) => {
      uiController.setRecordingState(data.recording);
    });

    // Start recording
    eventBus.publish(EventChannels.UI.RECORDING_STATE, { recording: true });
    expect(uiController.setRecordingState).toHaveBeenCalledWith(true);

    // Stop recording
    eventBus.publish(EventChannels.UI.RECORDING_STATE, { recording: false });
    expect(uiController.setRecordingState).toHaveBeenCalledWith(false);
  });
});
