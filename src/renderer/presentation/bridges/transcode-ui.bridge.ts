import { Service } from '@prismgb/core';
import { BaseService, type ServiceEventDescriptor } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';

type TranscodeToastLike = {
  show(): void;
  updateProgress(percent: number): void;
  showSuccess(): void;
  showError(): void;
  hide(): void;
};

type TranscodeUiControllerLike = {
  registry?: {
    get(name: string): unknown;
  } | null;
};

type TranscodeUIBridgeDependencies = {
  eventBus: EventBusLike;
  uiController: TranscodeUiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

@Service({
  "token": "transcodeUiBridge",
  "disposal": "dispose"
})
class TranscodeUIBridge extends BaseService {
  private static readonly eventDescriptors = [
    [EventChannels.TRANSCODE.STARTED, (bridge, data) => bridge._handleStarted(data)],
    [EventChannels.TRANSCODE.PROGRESS, (bridge, data) => bridge._handleProgress(data)],
    [EventChannels.TRANSCODE.COMPLETED, (bridge, data) => bridge._handleCompleted(data)],
    [EventChannels.TRANSCODE.ERROR, (bridge, data) => bridge._handleError(data)],
    [EventChannels.TRANSCODE.CANCELLED, (bridge) => bridge._handleCancelled()]
  ] satisfies readonly ServiceEventDescriptor<TranscodeUIBridge>[];

  private readonly eventBus: EventBusLike;
  private readonly uiController: TranscodeUiControllerLike;

  constructor(dependencies: TranscodeUIBridgeDependencies) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'TranscodeUIBridge');
    this.eventBus = dependencies.eventBus;
    this.uiController = dependencies.uiController;
  }

  get _toast(): TranscodeToastLike | undefined {
    return this.uiController?.registry?.get('transcodeToastComponent') as TranscodeToastLike | undefined;
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
    this._toast?.show();
  }

  _handleProgress(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { percent?: number }
      : {};
    this._toast?.updateProgress(payload.percent ?? -1);
  }

  _handleCompleted(data: unknown) {
    this.logger.info('Transcode completed', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
    this._toast?.showSuccess();
  }

  _handleError(data: unknown) {
    this.logger.error('Transcode error', data);
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
    this._toast?.showError();
  }

  _handleCancelled() {
    this.logger.info('Transcode cancelled');
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_ENABLED);
    this._toast?.hide();
  }
}

export { TranscodeUIBridge };
