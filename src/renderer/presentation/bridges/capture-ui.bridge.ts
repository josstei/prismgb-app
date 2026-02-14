/**
 * Capture UI Bridge
 *
 * Translates capture events into UI feedback.
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';
import { TIMING } from '@renderer/common/config/timing.config';

class CaptureUIBridge extends LifecycleService {
  static readonly dependencies = ['eventBus', 'uiController', 'uiEffects', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...CaptureUIBridge.dependencies], 'CaptureUIBridge');
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.CAPTURE.SCREENSHOT_TRIGGERED]: () => this._handleScreenshotTriggered(),
      [EventChannels.CAPTURE.SCREENSHOT_READY]: (data) => this._handleScreenshotReady(data),
      [EventChannels.CAPTURE.RECORDING_STARTED]: () => this._handleRecordingStarted(),
      [EventChannels.CAPTURE.RECORDING_STOPPED]: () => this._handleRecordingStopped(),
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data) => this._handleRecordingError(data),
      [EventChannels.CAPTURE.RECORDING_DEGRADED]: (data) => this._handleRecordingDegraded(data)
    });
  }

  _handleScreenshotTriggered() {
    this.uiEffects?.triggerButtonFeedback('screenshotBtn', 'capturing', TIMING.BUTTON_FEEDBACK_MS);
  }

  _handleScreenshotReady(data) {
    const { blob, filename } = data;
    this.uiController.triggerDownload(blob, filename);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
  }

  _handleRecordingStarted() {
    this.uiEffects?.triggerRecordButtonPop();
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
    this.uiController.updateRecordingButtonState(true);
  }

  _handleRecordingStopped() {
    this.uiEffects?.triggerRecordButtonPress();
    this.uiController.updateRecordingButtonState(false);
  }

  _handleRecordingError(data) {
    const { error } = data;
    this.logger.error('Recording error:', error);
    this.uiController.updateRecordingButtonState(false);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${error}`,
      type: 'error'
    });
  }

  _handleRecordingDegraded(data) {
    const { droppedFrames } = data;
    const reason = `Recording quality degraded: ${droppedFrames} frames dropped`;
    this.logger.warn('Recording degraded:', reason);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: reason,
      type: 'warning'
    });
  }
}

export { CaptureUIBridge };
