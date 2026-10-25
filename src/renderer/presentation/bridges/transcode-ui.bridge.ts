
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent, type TypedEventBusLike } from '@platform/events';
import type {
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeStartedPayload
} from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';

type TranscodeUIBridgeDependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class TranscodeUIBridge extends BaseService {
  private readonly eventBus: TypedEventBusLike;

  constructor({ eventBus, loggerFactory }: TranscodeUIBridgeDependencies) {
    super({ loggerFactory, eventBus }, 'TranscodeUIBridge');
    this.eventBus = eventBus;
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
