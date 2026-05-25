/**
 * Transcode UI Bridge
 *
 * Translates transcode events into UI feedback.
 * Shows transcode progress toast and manages record button state.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

class TranscodeUIBridge extends BaseService {
  _subscriptions: Array<() => void>;

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'TranscodeUIBridge');
    this._subscriptions = [];
  }

  get _toast() {
    return this.uiController?.registry?.get('transcodeToastComponent');
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.TRANSCODE.STARTED, (data: unknown) => this._handleStarted(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.PROGRESS, (data: unknown) => this._handleProgress(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.COMPLETED, (data: unknown) => this._handleCompleted(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.ERROR, (data: unknown) => this._handleError(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.CANCELLED, () => this._handleCancelled())
    );

    this.logger.info('TranscodeUIBridge initialized');
  }

  dispose() {
    this._subscriptions.forEach((unsubscribe: () => void) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this._toast?.dispose();
    this.logger.info('TranscodeUIBridge disposed');
  }

  _handleStarted(data: unknown) {
    this.logger.info('Transcode started', data);

    // Disable record button during transcode
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_DISABLED);

    // Show toast
    this._toast?.show();
  }

  _handleProgress(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { percent?: number }
      : {};
    this._toast?.updateProgress(payload.percent ?? -1);
  }

  _handleCompleted(data: unknown) {
    this.logger.info('Transcode completed', data);

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    // Show success state
    this._toast?.showSuccess();

  }

  _handleError(data: unknown) {
    this.logger.error('Transcode error', data);

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    this._toast?.showError();

  }

  _handleCancelled() {
    this.logger.info('Transcode cancelled');

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    // Hide toast
    this._toast?.hide();

  }
}

export { TranscodeUIBridge };
