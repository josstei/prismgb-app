import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type {
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeStartedPayload
} from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

@injectable()
class TranscodeUIBridge extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'TranscodeUIBridge');
  }

  initialize() {
    this.bindEventHandlers();
    this.logger.info('TranscodeUIBridge initialized');
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    this.logger.info('TranscodeUIBridge disposed');
  }

  @OnEvent(EventChannels.TRANSCODE.STARTED)
  _handleStarted(data: TranscodeStartedPayload) {
    this.logger.info('Transcode started', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_DISABLED);
  }

  @OnEvent(EventChannels.TRANSCODE.COMPLETED)
  _handleCompleted(data: TranscodeCompletedPayload) {
    this.logger.info('Transcode completed', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }

  @OnEvent(EventChannels.TRANSCODE.ERROR)
  _handleError(data: TranscodeErrorPayload) {
    this.logger.error('Transcode error', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }

  @OnEvent(EventChannels.TRANSCODE.CANCELLED)
  _handleCancelled() {
    this.logger.info('Transcode cancelled');
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }
}

export { TranscodeUIBridge };
