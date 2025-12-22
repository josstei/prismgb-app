/**
 * Capture UI Bridge
 *
 * Translates capture events into UI feedback and downloads.
 */

import { EventChannels } from '@infrastructure/events/event-channels.js';
import { downloadFile } from '@shared/lib/file-download.js';

class CaptureUiBridge {
  constructor({ eventBus, loggerFactory }) {
    this.eventBus = eventBus;
    this.logger = loggerFactory?.create('CaptureUiBridge') || console;
    this._subscriptions = [];
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_READY, (data) => this._handleScreenshotReady(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () => this._handleRecordingStarted()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STOPPED, () => this._handleRecordingStopped()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_READY, (data) => this._handleRecordingReady(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_ERROR, (data) => this._handleRecordingError(data))
    );

    this.logger.info('CaptureUiBridge initialized');
  }

  dispose() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this.logger.info('CaptureUiBridge disposed');
  }

  _handleScreenshotReady(data) {
    const { blob, filename } = data;
    downloadFile(blob, filename);
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
    downloadFile(blob, filename);
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
}

export { CaptureUiBridge };
