import { injectable, inject } from 'inversify';
import { BaseService, type ServiceEventDescriptor } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

@injectable()
class TranscodeUIBridge extends BaseService {
  private static readonly eventDescriptors = [
    [EventChannels.TRANSCODE.STARTED, (bridge, data) => bridge._handleStarted(data)],
    [EventChannels.TRANSCODE.COMPLETED, (bridge, data) => bridge._handleCompleted(data)],
    [EventChannels.TRANSCODE.ERROR, (bridge, data) => bridge._handleError(data)],
    [EventChannels.TRANSCODE.CANCELLED, (bridge) => bridge._handleCancelled()]
  ] satisfies readonly ServiceEventDescriptor<TranscodeUIBridge>[];

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'TranscodeUIBridge');
  }

  initialize() {
    this.listenToDescriptors(TranscodeUIBridge.eventDescriptors);
    this.logger.info('TranscodeUIBridge initialized');
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    this.logger.info('TranscodeUIBridge disposed');
  }

  _handleStarted(data: unknown) {
    this.logger.info('Transcode started', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_DISABLED);
  }

  _handleCompleted(data: unknown) {
    this.logger.info('Transcode completed', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }

  _handleError(data: unknown) {
    this.logger.error('Transcode error', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }

  _handleCancelled() {
    this.logger.info('Transcode cancelled');
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
  }
}

export { TranscodeUIBridge };
