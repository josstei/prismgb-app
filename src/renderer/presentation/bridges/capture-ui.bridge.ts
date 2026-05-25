/**
 * Capture UI Bridge
 *
 * Translates capture events into UI feedback.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { UiButtonFeedbackPayload } from '@shared/events/event-payloads.js';
import { TIMING } from '@renderer/presentation/config/constants.config';

class CaptureUIBridge extends BaseService {
  _subscriptions: Array<() => void>;

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'CaptureUIBridge');
    this._subscriptions = [];
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () => this._handleScreenshotTriggered()),
      this.eventBus.subscribe(EventChannels.CAPTURE.SCREENSHOT_READY, (data: unknown) => this._handleScreenshotReady(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STARTED, () => this._handleRecordingStarted()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_STOPPED, () => this._handleRecordingStopped()),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_ERROR, (data: unknown) => this._handleRecordingError(data)),
      this.eventBus.subscribe(EventChannels.CAPTURE.RECORDING_DEGRADED, (data: unknown) => this._handleRecordingDegraded(data))
    );

    this.logger.info('CaptureUIBridge initialized');
  }

  dispose() {
    this._subscriptions.forEach((unsubscribe: () => void) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this.logger.info('CaptureUIBridge disposed');
  }

  _handleScreenshotTriggered() {
    const payload = {
      elementKey: 'screenshotBtn',
      className: 'capturing',
      duration: TIMING.BUTTON_FEEDBACK_MS
    } satisfies UiButtonFeedbackPayload;
    this.eventBus.publish(EventChannels.UI.BUTTON_FEEDBACK, payload);
  }

  _handleScreenshotReady(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { blob?: Blob; filename?: string }
      : {};
    const { blob, filename } = payload;
    if (!(blob instanceof Blob) || typeof filename !== 'string') {
      return;
    }
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

  _handleRecordingError(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { error?: unknown }
      : {};
    const { error } = payload;
    this.logger.error('Recording error:', error);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${error}`,
      type: 'error'
    });
  }

  _handleRecordingDegraded(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { droppedFrames?: number }
      : {};
    const droppedFrames = typeof payload.droppedFrames === 'number' ? payload.droppedFrames : 0;
    const reason = `Recording quality degraded: ${droppedFrames} frames dropped`;
    this.logger.warn('Recording degraded:', reason);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: reason,
      type: 'warning'
    });
  }
}

export { CaptureUIBridge };
