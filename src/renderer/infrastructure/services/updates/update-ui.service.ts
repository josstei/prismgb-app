import { BaseService } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type UpdateUiServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class UpdateUiService extends BaseService {
  private readonly eventBus: EventBusLike;

  constructor(dependencies: UpdateUiServiceDependencies) {
    super(dependencies, 'UpdateUiService');
    this.eventBus = dependencies.eventBus;
  }

  initialize() {
    this.listen(EventChannels.UPDATE.AVAILABLE, (info: unknown) => this._handleUpdateAvailable(info));
    this.listen(EventChannels.UPDATE.NOT_AVAILABLE, () => this._handleNoUpdate());
    this.listen(EventChannels.UPDATE.PROGRESS, (progress: unknown) => this._handleProgress(progress));
    this.listen(EventChannels.UPDATE.DOWNLOADED, (info: unknown) => this._handleDownloaded(info));
    this.listen(EventChannels.UPDATE.ERROR, (error: unknown) => this._handleError(error));
    this.logger.info('UpdateUiService initialized');
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.logger.info('UpdateUiService disposed');
    return disposed;
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
