/**
 * Transcode UI Bridge
 *
 * Translates transcode events into UI feedback.
 * Shows transcode progress toast and manages record button state.
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/application/config/event-channels';

class TranscodeUIBridge extends LifecycleService {
  static readonly dependencies = ['eventBus', 'uiController', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...TranscodeUIBridge.dependencies], 'TranscodeUIBridge');
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

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.TRANSCODE.STARTED]: (data) => this._handleStarted(data),
      [EventChannels.TRANSCODE.PROGRESS]: (data) => this._handleProgress(data),
      [EventChannels.TRANSCODE.COMPLETED]: (data) => this._handleCompleted(data),
      [EventChannels.TRANSCODE.ERROR]: (data) => this._handleError(data),
      [EventChannels.TRANSCODE.CANCELLED]: () => this._handleCancelled()
    });

    this.logger.info('TranscodeUIBridge initialized');
  }

  async onDispose() {
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

    // Disable record button during transcode
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_DISABLED);

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

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

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

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

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

    // Re-enable record button
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);

    // Hide toast
    this._toast?.hide();

    this._currentFormat = null;
  }
}

export { TranscodeUIBridge };
