import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import type { TranscodeCompletedPayload, TranscodeErrorPayload } from '@platform/ipc';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { TranscodeStartedPayload } from '@renderer/lib/events/event-payloads';
import type { LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

@injectable()
class TranscodeUIBridge extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'TranscodeUIBridge');
  }

  initialize() {
    this.bindEventHandlers(this.eventBus);
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
