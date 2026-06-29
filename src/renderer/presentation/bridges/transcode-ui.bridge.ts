import { BaseService, type ServiceEventDescriptor } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type TranscodeUIBridgeDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class TranscodeUIBridge extends BaseService {
  private static readonly eventDescriptors = [
    [EventChannels.TRANSCODE.STARTED, (bridge, data) => bridge._handleStarted(data)],
    [EventChannels.TRANSCODE.COMPLETED, (bridge, data) => bridge._handleCompleted(data)],
    [EventChannels.TRANSCODE.ERROR, (bridge, data) => bridge._handleError(data)],
    [EventChannels.TRANSCODE.CANCELLED, (bridge) => bridge._handleCancelled()]
  ] satisfies readonly ServiceEventDescriptor<TranscodeUIBridge>[];

  private readonly eventBus: EventBusLike;

  constructor(dependencies: TranscodeUIBridgeDependencies) {
    super(dependencies, 'TranscodeUIBridge');
    this.eventBus = dependencies.eventBus;
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
