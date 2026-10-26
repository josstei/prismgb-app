
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type {
  TypedEventBusLike,
  UiButtonFeedbackPayload,
  UiStreamingModePayload
} from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';

import type { UIController } from '@renderer/presentation/controller/ui.controller.js';

type UiControllerLike = Pick<UIController,
  'setStreamingMode' | 'updateFullscreenButton' | 'enableControlsAutoHide' | 'disableControlsAutoHide'
  | 'triggerShutterFlash' | 'triggerRecordButtonPop' | 'triggerRecordButtonPress' | 'triggerButtonFeedback'
  | 'updateRecordingButtonState' | 'setRecordButtonDisabled'>;

function getBooleanPayloadValue(data: unknown, key: string): boolean | null {
  if (typeof data !== 'object' || data === null || !(key in data)) {
    return null;
  }

  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

type UIEventBridgeDependencies = {
  eventBus: TypedEventBusLike;
  uiController: UiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

export class UIEventBridge extends BaseService {
  private readonly eventBus: TypedEventBusLike;
  private readonly uiController: UiControllerLike;

  constructor({ eventBus, uiController, loggerFactory }: UIEventBridgeDependencies) {
    super({ loggerFactory, eventBus }, 'UIEventBridge');
    this.eventBus = eventBus;
    this.uiController = uiController;
  }

  initialize(): void {
    this.bindEventHandlers();
    this.logger.info('UIEventBridge initialized');
  }

  @OnEvent(EventChannels.UI.STREAMING_MODE)
  private _handleStreamingMode(data: UiStreamingModePayload): void {
    this.uiController.setStreamingMode(data.enabled);
  }

  @OnEvent(EventChannels.UI.SHUTTER_FLASH)
  private _handleShutterFlash(): void {
    this.uiController.triggerShutterFlash();
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_POP)
  private _handleRecordButtonPop(): void {
    this.uiController.triggerRecordButtonPop();
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_PRESS)
  private _handleRecordButtonPress(): void {
    this.uiController.triggerRecordButtonPress();
  }

  @OnEvent(EventChannels.UI.BUTTON_FEEDBACK)
  private _handleButtonFeedback(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as Partial<UiButtonFeedbackPayload>
      : {};
    if (!payload.elementKey) {
      return;
    }
    this.uiController.triggerButtonFeedback(
      payload.elementKey,
      payload.className ?? 'active',
      payload.duration ?? 200
    );
  }

  @OnEvent(EventChannels.UI.RECORDING_STATE)
  private _handleRecordingState(data: unknown): void {
    const active = getBooleanPayloadValue(data, 'active');
    if (active === null) {
      this.logger.warn('Ignoring invalid recording state payload');
      return;
    }
    this.uiController.updateRecordingButtonState(active);
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_DISABLED)
  private _handleRecordButtonDisabled(): void {
    this.uiController.setRecordButtonDisabled(true);
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_ENABLED)
  private _handleRecordButtonEnabled(): void {
    this.uiController.setRecordButtonDisabled(false);
  }

  @OnEvent(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED)
  private _handleCinematicMode(data: unknown): void {
    const enabled = getBooleanPayloadValue(data, 'enabled');
    if (enabled === null) {
      this.logger.warn('Ignoring invalid cinematic mode payload');
      return;
    }
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
      message: `Cinematic mode ${enabled ? 'enabled' : 'disabled'}`
    });
  }

  @OnEvent(EventChannels.UI.FULLSCREEN_STATE)
  private _handleFullscreenState(data: unknown): void {
    const active = getBooleanPayloadValue(data, 'active');
    if (active === null) {
      this.logger.warn('Ignoring invalid fullscreen state payload');
      return;
    }
    this.uiController.updateFullscreenButton(active);
    if (active) this.uiController.enableControlsAutoHide();
    else this.uiController.disableControlsAutoHide();
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.logger.info('UIEventBridge disposed');
    return disposed;
  }
}
