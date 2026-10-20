import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { UiFullscreenStatePayload, UiStreamingModePayload } from '@renderer/lib/events/event-payloads';
import { TOKENS } from '@renderer/application/di/tokens';
import type { AutoHideEffect } from '@renderer/presentation/effects/auto-hide.effect';
import type { FeedbackEffect } from '@renderer/presentation/effects/feedback.effect';
import type { DomBindings } from '@renderer/presentation/primitives/dom-bindings.utils';
import type { UiComponentHost } from '@renderer/presentation/ui-component.host';

/** The presentation layer's only domain-event sink: maps domain events onto components and effects. */
@injectable()
export class UiEventBridge extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.uiComponentHost) private readonly components: UiComponentHost,
    @inject(TOKENS.domBindings) private readonly dom: DomBindings,
    @inject(TOKENS.autoHideEffect) private readonly autoHide: AutoHideEffect,
    @inject(TOKENS.feedbackEffect) private readonly feedback: FeedbackEffect,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'UiEventBridge');
  }

  initialize(): void {
    this.bindEventHandlers(this.eventBus);
    this.logger.info('UiEventBridge initialized');
  }

  @OnEvent(EventChannels.CAPTURE.SCREENSHOT_TRIGGERED)
  private handleScreenshotTriggered(): void {
    this.feedback.shutterFlash();
    this.feedback.screenshotFeedback();
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_STARTED)
  private handleRecordingStarted(): void {
    this.feedback.recordButtonPop();
    this.feedback.setRecording(true);
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_STOPPED)
  private handleRecordingStopped(): void {
    this.feedback.recordButtonPress();
    this.feedback.setRecording(false);
  }

  @OnEvent(EventChannels.CAPTURE.RECORDING_ERROR)
  private handleRecordingError(): void {
    this.feedback.setRecording(false);
  }

  @OnEvent(EventChannels.TRANSCODE.STARTED)
  private handleTranscodeStarted(): void {
    this.feedback.setRecordButtonDisabled(true);
  }

  @OnEvent(EventChannels.TRANSCODE.COMPLETED)
  @OnEvent(EventChannels.TRANSCODE.ERROR)
  @OnEvent(EventChannels.TRANSCODE.CANCELLED)
  private handleTranscodeEnded(): void {
    this.feedback.setRecordButtonDisabled(false);
  }

  @OnEvent(EventChannels.UI.STREAMING_MODE)
  private handleStreamingMode({ enabled }: UiStreamingModePayload): void {
    this.components.get('streamingControlsComponent').setStreamingMode(enabled);
    if (enabled) {
      this.autoHide.enableToolbar(this.dom.streaming.streamToolbar);
      this.autoHide.enableCursor();
    } else {
      this.autoHide.disableCursor();
      this.autoHide.disableToolbar();
      this.components.get('shaderSelectorComponent').hide();
    }
  }

  @OnEvent(EventChannels.UI.FULLSCREEN_STATE)
  private handleFullscreenState({ active }: UiFullscreenStatePayload): void {
    const { fullscreenBtn, fullscreenControls } = this.dom.streaming;
    if (fullscreenBtn) {
      fullscreenBtn.title = active ? 'Exit Fullscreen' : 'Fullscreen';
    }
    if (active) {
      this.autoHide.enableControls(fullscreenControls);
    } else {
      this.autoHide.disableControls();
    }
  }
}
