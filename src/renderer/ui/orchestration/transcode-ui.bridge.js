/**
 * Transcode UI Bridge
 *
 * Translates transcode events into UI feedback.
 * Shows transcode progress toast and manages record button state.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class TranscodeUIBridge extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'TranscodeUIBridge');
    this._subscriptions = [];
    this._currentFormat = null;
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
   * @param {Object} data - Started data with format
   * @private
   */
  _handleStarted(data) {
    this.logger.info('Transcode started', data);
    this._currentFormat = data?.format?.toUpperCase() || 'MP4';

    // Disable record button during transcode - call directly to avoid event indirection
    this.uiController.setRecordButtonDisabled(true);

    // Show toast
    this._toast?.show(this._currentFormat);
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

    // Re-enable record button - call directly to avoid event indirection
    this.uiController.setRecordButtonDisabled(false);

    // Show success state
    this._toast?.showSuccess();

    this._currentFormat = null;
  }

  /**
   * Handle transcode error
   * @param {Object} data - Error data
   * @private
   */
  _handleError(data) {
    this.logger.error('Transcode error', data);

    // Re-enable record button - call directly to avoid event indirection
    this.uiController.setRecordButtonDisabled(false);

    const errorMessage = data?.message || data?.error || 'Conversion failed';
    this._toast?.showError(errorMessage);

    this._currentFormat = null;
  }

  /**
   * Handle transcode cancelled
   * @private
   */
  _handleCancelled() {
    this.logger.info('Transcode cancelled');

    // Re-enable record button - call directly to avoid event indirection
    this.uiController.setRecordButtonDisabled(false);

    // Hide toast
    this._toast?.hide();

    this._currentFormat = null;
  }
}

export { TranscodeUIBridge };
