/**
 * Update UI Service
 *
 * Translates update events into UI notifications and badge visibility.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

class UpdateUiService extends BaseService {
  _subscriptions: Array<() => void>;

  constructor(dependencies: Record<string, unknown>) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'UpdateUiService');
    this._subscriptions = [];
  }

  initialize() {
    this._subscriptions.push(
      this.eventBus.subscribe(EventChannels.UPDATE.AVAILABLE, (info: unknown) => this._handleUpdateAvailable(info)),
      this.eventBus.subscribe(EventChannels.UPDATE.NOT_AVAILABLE, () => this._handleNoUpdate()),
      this.eventBus.subscribe(EventChannels.UPDATE.PROGRESS, (progress: unknown) => this._handleProgress(progress)),
      this.eventBus.subscribe(EventChannels.UPDATE.DOWNLOADED, (info: unknown) => this._handleDownloaded(info)),
      this.eventBus.subscribe(EventChannels.UPDATE.ERROR, (error: unknown) => this._handleError(error))
    );

    this.logger.info('UpdateUiService initialized');
  }

  dispose() {
    this._subscriptions.forEach((unsubscribe: () => void) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
    this.logger.info('UpdateUiService disposed');
  }

  _handleUpdateAvailable(info: unknown) {
    const payload = typeof info === 'object' && info !== null
      ? info as { version?: string }
      : {};
    this.logger.info('Update available', { version: payload.version });

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update v${payload.version ?? 'unknown'} available`,
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

  _handleProgress(progress: unknown) {
    const payload = typeof progress === 'object' && progress !== null
      ? progress as { percent?: number }
      : {};
    this.logger.debug('Download progress', { percent: payload.percent?.toFixed(1) });
  }

  _handleDownloaded(info: unknown) {
    const payload = typeof info === 'object' && info !== null
      ? info as { version?: string }
      : {};
    this.logger.info('Update downloaded', { version: payload.version });

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update v${payload.version ?? 'unknown'} ready to install`,
      type: 'success'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_SHOW);
  }

  _handleError(error: unknown) {
    const payload = typeof error === 'object' && error !== null
      ? error as { message?: string }
      : {};
    this.logger.error('Update error', error);

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Update failed: ${payload.message || 'Unknown error'}`,
      type: 'error'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_HIDE);
  }
}

export { UpdateUiService };
