/**
 * Capture UI Bridge
 *
 * Translates capture events into UI feedback.
 */

import { EventBridgeBase } from './event-bridge.base';
import { EventChannels } from '@renderer/common/config/event-channels';
import { TIMING } from '@renderer/common/config/timing.config';

class CaptureUIBridge extends EventBridgeBase {
  static readonly dependencies = ['eventBus', 'uiController', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...CaptureUIBridge.dependencies], 'CaptureUIBridge');
  }

  protected getEventMappings() {
    return {
      [EventChannels.CAPTURE.SCREENSHOT_TRIGGERED]: () => this._handleScreenshotTriggered(),
      [EventChannels.CAPTURE.SCREENSHOT_READY]: (data) => this._handleScreenshotReady(data),
      [EventChannels.CAPTURE.RECORDING_STARTED]: () => this._handleRecordingStarted(),
      [EventChannels.CAPTURE.RECORDING_STOPPED]: () => this._handleRecordingStopped(),
      [EventChannels.CAPTURE.RECORDING_ERROR]: (data) => this._handleRecordingError(data),
      [EventChannels.CAPTURE.RECORDING_DEGRADED]: (data) => this._handleRecordingDegraded(data)
    };
  }

  _handleScreenshotTriggered() {
    this.eventBus.publish(EventChannels.UI.BUTTON_FEEDBACK, {
      elementKey: 'screenshotBtn',
      className: 'capturing',
      duration: TIMING.BUTTON_FEEDBACK_MS
    });
  }

  _handleScreenshotReady(data) {
    const { blob, filename } = data;
    this.uiController.triggerDownload(blob, filename);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
  }

  _handleRecordingStarted() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_POP);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: true });
  }

  _handleRecordingStopped() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_PRESS);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
  }

  _handleRecordingError(data) {
    const { error } = data;
    this.logger.error('Recording error:', error);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
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
