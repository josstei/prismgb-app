/**
 * Update UI Service
 *
 * Translates update events into UI notifications and badge visibility.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class UpdateUiService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'UpdateUiService');
    this._subscriptions = [];
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.UPDATE.AVAILABLE, (info) => this._handleUpdateAvailable(info)),
      this.eventBus.subscribe(EventChannels.UPDATE.NOT_AVAILABLE, () => this._handleNoUpdate()),
      this.eventBus.subscribe(EventChannels.UPDATE.PROGRESS, (progress) => this._handleProgress(progress)),
      this.eventBus.subscribe(EventChannels.UPDATE.DOWNLOADED, (info) => this._handleDownloaded(info)),
      this.eventBus.subscribe(EventChannels.UPDATE.ERROR, (error) => this._handleError(error))
    );

    this.logger.info('UpdateUiService initialized');
  }

  dispose() {
    this._subscriptions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this.logger.info('UpdateUiService disposed');
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

export { UpdateUiService };
