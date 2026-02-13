/**
 * Update UI Bridge
 *
 * Translates update events into UI notifications and badge visibility.
 */

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

class UpdateUIBridge extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...UpdateUIBridge.dependencies], 'UpdateUIBridge');
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.UPDATE.AVAILABLE]: (info) => this._handleUpdateAvailable(info),
      [EventChannels.UPDATE.NOT_AVAILABLE]: () => this._handleNoUpdate(),
      [EventChannels.UPDATE.PROGRESS]: (progress) => this._handleProgress(progress),
      [EventChannels.UPDATE.DOWNLOADED]: (info) => this._handleDownloaded(info),
      [EventChannels.UPDATE.ERROR]: (error) => this._handleError(error)
    });

    this.logger.info('UpdateUIBridge initialized');
  }

  async onDispose() {
    this.logger.info('UpdateUIBridge disposed');
  }

  _handleUpdateAvailable(info) {
    this.logger.info('Update available', { version: info?.version });

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update v${info?.version} available`,
      type: 'info'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_SHOW);
  }

  _handleNoUpdate() {
    this.logger.debug('No update available');

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: 'You\'re up to date',
      type: 'success'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_HIDE);
  }

  _handleProgress(progress) {
    this.logger.debug('Download progress', { percent: progress?.percent?.toFixed(1) });
  }

  _handleDownloaded(info) {
    this.logger.info('Update downloaded', { version: info?.version });

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update v${info?.version} ready to install`,
      type: 'success'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_SHOW);
  }

  _handleError(error) {
    this.logger.error('Update error', error);

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update failed: ${error?.message || 'Unknown error'}`,
      type: 'error'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_HIDE);
  }
}

export { UpdateUIBridge };
