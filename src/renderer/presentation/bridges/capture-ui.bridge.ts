import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { RecordingDegradedPayload, RecordingErrorPayload, ScreenshotReadyPayload, UiButtonFeedbackPayload } from '@renderer/lib/events/event-payloads';
import { TIMING } from '@platform/config';
import type { LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

type CaptureUiControllerLike = {
  triggerDownload(blob: Blob, filename: string): void;
};

@injectable()
class CaptureUIBridge extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.uiController) private readonly uiController: CaptureUiControllerLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'CaptureUIBridge');
  }

  initialize() {
    this.bindEventHandlers(this.eventBus);
    this.logger.info('CaptureUIBridge initialized');
  }

  override dispose(): Promise<void> {
    const disposed = super.dispose();
    this.logger.info('CaptureUIBridge disposed');
    return disposed;
  }

  @OnEvent(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED)
  _handleScreenshotTriggered() {
    const payload = {
      elementKey: 'screenshotBtn',
      className: 'capturing',
      duration: TIMING.BUTTON_FEEDBACK_MS
    } satisfies UiButtonFeedbackPayload;
    this.eventBus.publish(EventChannels.UI.BUTTON_FEEDBACK, payload);
  }

  @OnEvent(EventChannels.CAPTURE.SCREENSHOT_READY)
  _handleScreenshotReady(data: ScreenshotReadyPayload) {
    this.uiController.triggerDownload(data.blob, data.filename);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Screenshot saved!' });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_STARTED)
  _handleRecordingStarted() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_POP);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Recording started' });
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: true });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_STOPPED)
  _handleRecordingStopped() {
    this.eventBus.publish(EventChannels.UI.RECORD_BUTTON_PRESS);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_ERROR)
  _handleRecordingError(data: RecordingErrorPayload) {
    const { error } = data;
    this.logger.error('Recording error:', error);
    this.eventBus.publish(EventChannels.UI.RECORDING_STATE, { active: false });
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Recording failed: ${error}`,
      type: 'error'
    });
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_DEGRADED)
  _handleRecordingDegraded(data: RecordingDegradedPayload) {
    const droppedFrames = data.droppedFrames ?? 0;
    const reason = `Recording quality degraded: ${droppedFrames} frames dropped`;
    this.logger.warn('Recording degraded:', reason);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: reason,
      type: 'warning'
    });
  }
}

export { CaptureUIBridge };
