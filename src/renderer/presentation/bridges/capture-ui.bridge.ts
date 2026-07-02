import { BaseService, type ServiceEventDescriptor } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { UiButtonFeedbackPayload } from '@platform/events';
import { TIMING } from '@platform/config';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

type CaptureUiControllerLike = {
  triggerDownload(blob: Blob, filename: string): void;
};

type CaptureUIBridgeDependencies = {
  eventBus: EventBusLike;
  uiController: CaptureUiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

class CaptureUIBridge extends BaseService {
  private static readonly eventDescriptors = [
    [EventChannels.CAPTURE.SCREENSHOT_TRIGGERED, (bridge) => bridge._handleScreenshotTriggered()],
    [EventChannels.CAPTURE.SCREENSHOT_READY, (bridge, data) => bridge._handleScreenshotReady(data)],
    [EventChannels.CAPTURE.RECORDING_STARTED, (bridge) => bridge._handleRecordingStarted()],
    [EventChannels.CAPTURE.RECORDING_STOPPED, (bridge) => bridge._handleRecordingStopped()],
    [EventChannels.CAPTURE.RECORDING_ERROR, (bridge, data) => bridge._handleRecordingError(data)],
    [EventChannels.CAPTURE.RECORDING_DEGRADED, (bridge, data) => bridge._handleRecordingDegraded(data)]
  ] satisfies readonly ServiceEventDescriptor<CaptureUIBridge>[];

  private readonly eventBus: EventBusLike;
  private readonly uiController: CaptureUiControllerLike;

  constructor(dependencies: CaptureUIBridgeDependencies) {
    super(dependencies, 'CaptureUIBridge');
    this.eventBus = dependencies.eventBus;
    this.uiController = dependencies.uiController;
  }

  initialize() {
    this.listenToDescriptors(CaptureUIBridge.eventDescriptors);
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
