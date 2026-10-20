import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { LoggerFactory } from '@platform/core';
import type { EventBusLike } from '@platform/events';
import { TOKENS } from '@renderer/application/di/tokens';

@injectable()
class UpdateUiService extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'UpdateUiService');
  }

  initialize() {
    this.bindEventHandlers(this.eventBus);
    this.logger.info('UpdateUiService initialized');
  }

  override dispose(): Promise<void> {
    const disposed = super.dispose();
    this.logger.info('UpdateUiService disposed');
    return disposed;
  }

  @OnEvent(EventChannels.UPDATE.AVAILABLE)
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

  @OnEvent(EventChannels.UPDATE.NOT_AVAILABLE)
  _handleNoUpdate() {
    this.logger.debug('No update available');

    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: 'You\'re up to date',
      type: 'success'
    });

    this.eventBus.publish(EventChannels.UPDATE.BADGE_HIDE);
  }

  @OnEvent(EventChannels.UPDATE.PROGRESS)
  _handleProgress(progress: unknown) {
    const payload = typeof progress === 'object' && progress !== null
      ? progress as { percent?: number }
      : {};
    this.logger.debug('Download progress', { percent: payload.percent?.toFixed(1) });
  }

  @OnEvent(EventChannels.UPDATE.DOWNLOADED)
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

  @OnEvent(EventChannels.UPDATE.ERROR)
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
