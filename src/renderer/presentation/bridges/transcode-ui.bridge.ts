import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type TranscodeToastLike = {
  show(): void;
  updateProgress(percent: number): void;
  showSuccess(): void;
  showError(): void;
  hide(): void;
  dispose(): void;
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

class TranscodeUIBridge extends BaseService {
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
    this.listen(EventChannels.TRANSCODE.STARTED, (data: unknown) => this._handleStarted(data));
    this.listen(EventChannels.TRANSCODE.PROGRESS, (data: unknown) => this._handleProgress(data));
    this.listen(EventChannels.TRANSCODE.COMPLETED, (data: unknown) => this._handleCompleted(data));
    this.listen(EventChannels.TRANSCODE.ERROR, (data: unknown) => this._handleError(data));
    this.listen(EventChannels.TRANSCODE.CANCELLED, () => this._handleCancelled());
    this.logger.info('TranscodeUIBridge initialized');
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this._toast?.dispose();
    this.logger.info('TranscodeUIBridge disposed');
    return disposed;
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
