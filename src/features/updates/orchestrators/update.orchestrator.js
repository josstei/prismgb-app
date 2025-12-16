/**
 * Update Orchestrator
 *
 * Coordinates update UI state, triggers toast notifications,
 * and manages the update badge visibility.
 *
 * Responsibilities:
 * - Initialize UpdateService
 * - Show toast notifications for update events
 * - Manage settings badge visibility
 * - Provide facade for update actions
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { UpdateState } from '../services/update.service.js';

class UpdateOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['updateService', 'eventBus', 'loggerFactory'],
      'UpdateOrchestrator'
    );
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.UPDATE.AVAILABLE]: (info) => this._handleUpdateAvailable(info),
      [EventChannels.UPDATE.NOT_AVAILABLE]: () => this._handleNoUpdate(),
      [EventChannels.UPDATE.PROGRESS]: (progress) => this._handleProgress(progress),
      [EventChannels.UPDATE.DOWNLOADED]: (info) => this._handleDownloaded(info),
      [EventChannels.UPDATE.ERROR]: (error) => this._handleError(error)
    });

    await this.updateService.initialize();
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

  getStatus() {
    return this.updateService.getStatus();
  }

  get state() {
    return this.updateService.state;
  }

  get updateInfo() {
    return this.updateService.updateInfo;
  }

  async checkForUpdates() {
    this.logger.info('Checking for updates...');
    return this.updateService.checkForUpdates();
  }

  async downloadUpdate() {
    this.logger.info('Downloading update...');
    return this.updateService.downloadUpdate();
  }

  async installUpdate() {
    this.logger.info('Installing update...');
    return this.updateService.installUpdate();
  }

  async onCleanup() {
    this.updateService.dispose();
  }
}

export { UpdateOrchestrator, UpdateState };
