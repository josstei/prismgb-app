/**
 * Capture UI Bridge
 *
 * Translates capture events into UI feedback.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { TIMING } from '@shared/config/constants.config.js';

class CaptureUIBridge extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'CaptureUIBridge');
    this._subscriptions = [];
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () => this._handleScreenshotTriggered()),
      this.eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_READY, (data) => this._handleScreenshotReady(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () => this._handleRecordingStarted()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STOPPED, () => this._handleRecordingStopped()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_READY, (data) => this._handleRecordingReady(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_ERROR, (data) => this._handleRecordingError(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_DEGRADED, (data) => this._handleRecordingDegraded(data))
    );

    this.logger.info('CaptureUIBridge initialized');
  }

  dispose() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this.logger.info('CaptureUIBridge disposed');
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

  _handleRecordingReady(data) {
    const { blob, filename } = data;
    this.uiController.triggerDownload(blob, filename);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording saved!' });
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
