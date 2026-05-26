import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type { UiButtonFeedbackPayload } from '@shared/events/event-payloads.js';
import { TIMING } from '@renderer/presentation/config/constants.config';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type CaptureUiControllerLike = {
  triggerDownload(blob: Blob, filename: string): void;
};

type CaptureUIBridgeDependencies = {
  eventBus: EventBusLike;
  uiController: CaptureUiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

class CaptureUIBridge extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly uiController: CaptureUiControllerLike;

  constructor(dependencies: CaptureUIBridgeDependencies) {
    super(dependencies, ['eventBus', 'uiController', 'loggerFactory'], 'CaptureUIBridge');
    this.eventBus = dependencies.eventBus;
    this.uiController = dependencies.uiController;
  }

  initialize() {
    this.listen(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, () => this._handleScreenshotTriggered());
    this.listen(EventChannels.CAPTURE.SCREENSHOT_READY, (data: unknown) => this._handleScreenshotReady(data));
    this.listen(EventChannels.CAPTURE.RECORDING_STARTED, () => this._handleRecordingStarted());
    this.listen(EventChannels.CAPTURE.RECORDING_STOPPED, () => this._handleRecordingStopped());
    this.listen(EventChannels.CAPTURE.RECORDING_ERROR, (data: unknown) => this._handleRecordingError(data));
    this.listen(EventChannels.CAPTURE.RECORDING_DEGRADED, (data: unknown) => this._handleRecordingDegraded(data));
    this.logger.info('CaptureUIBridge initialized');
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.logger.info('CaptureUIBridge disposed');
    return disposed;
  }

  _handleScreenshotTriggered() {
    const payload = {
      elementKey: 'screenshotBtn',
      className: 'capturing',
      duration: TIMING.BUTTON_FEEDBACK_MS
    } satisfies UiButtonFeedbackPayload;
    this.eventBus.publish(EventChannels.UI.BUTTON_FEEDBACK, payload);
  }

  _handleScreenshotReady(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { blob?: Blob; filename?: string }
      : {};
    const { blob, filename } = payload;
    if (!(blob instanceof Blob) || typeof filename !== 'string') {
      return;
    }
    this.uiController.triggerDownload(blob, filename);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
  }

  _handleRecordingStarted() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_POP);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: true });
  }

  _handleRecordingStopped() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_PRESS);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
  }

  _handleRecordingError(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { error?: unknown }
      : {};
    const { error } = payload;
    this.logger.error('Recording error:', error);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${error}`,
      type: 'error'
    });
  }

  _handleRecordingDegraded(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { droppedFrames?: number }
      : {};
    const droppedFrames = typeof payload.droppedFrames === 'number' ? payload.droppedFrames : 0;
    const reason = `Recording quality degraded: ${droppedFrames} frames dropped`;
    this.logger.warn('Recording degraded:', reason);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: reason,
      type: 'warning'
    });
  }
}

export { CaptureUIBridge };
