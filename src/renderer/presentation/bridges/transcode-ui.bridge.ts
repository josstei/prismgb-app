/**
 * Transcode UI Bridge
 *
 * Translates transcode events into UI feedback.
 * Shows transcode progress toast and manages record button state.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

class TranscodeUIBridge extends BaseService {

  constructor(dependencies) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'TranscodeUIBridge');
    this._subscriptions = [];
  }

  /**
   * Get the transcode toast component
   * @returns {TranscodeToastComponent|null}
   * @private
   */
  get _toast() {
    return this.uiController?.registry?.get('transcodeToastComponent');
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.TRANSCODE.STARTED, (data) => this._handleStarted(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.PROGRESS, (data) => this._handleProgress(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.COMPLETED, (data) => this._handleCompleted(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.ERROR, (data) => this._handleError(data)),
      this.eventBus.subscribe(EventChannels.TRANSCODE.CANCELLED, () => this._handleCancelled())
    );

    this.logger.info('TranscodeUIBridge initialized');
  }

  dispose() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this._toast?.dispose();
    this.logger.info('TranscodeUIBridge disposed');
  }

  /**
   * Handle transcode started
   * @param {Object} data - Started data
   * @private
   */
  _handleStarted(data) {
    this.logger.info('Transcode started', data);

    // Disable record button during transcode
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_DISABLED);

    // Show toast
    this._toast?.show();
  }

  /**
   * Handle transcode progress update
   * @param {Object} data - Progress data with percent (-1 if unknown)
   * @private
   */
  _handleProgress(data) {
    this._toast?.updateProgress(data?.percent ?? -1);
  }

  /**
   * Handle transcode completed
   * @param {Object} data - Completion data
   * @private
   */
  _handleCompleted(data) {
    this.logger.info('Transcode completed', data);

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    // Show success state
    this._toast?.showSuccess();

  }

  /**
   * Handle transcode error
   * @param {Object} data - Error data
   * @private
   */
  _handleError(data) {
    this.logger.error('Transcode error', data);

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    this._toast?.showError();

  }

  /**
   * Handle transcode cancelled
   * @private
   */
  _handleCancelled() {
    this.logger.info('Transcode cancelled');

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    // Hide toast
    this._toast?.hide();

  }
}

export { TranscodeUIBridge };
