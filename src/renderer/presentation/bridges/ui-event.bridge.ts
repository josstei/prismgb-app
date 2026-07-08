import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type {
  TypedEventBusLike,
  UiButtonFeedbackPayload,
  UiStreamingModePayload
} from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import type { DomBindings } from '@renderer/presentation/primitives/dom-bindings.utils.js';

type UIEffectsLike = {
  triggerShutterFlash(): void;
  triggerRecordButtonPop(): void;
  triggerRecordButtonPress(): void;
  triggerButtonFeedback(elementKey: string, className: string, duration: number): void;
  setRecordingButtonState(recordButton: HTMLButtonElement | null, isActive: boolean): void;
};

type PresentationModeServiceLike = {
  handleStreamingMode(enabled: boolean): void;
  handleFullscreenState(active: boolean): void;
};

function getBooleanPayloadValue(data: unknown, key: string): boolean | null {
  if (typeof data !== 'object' || data === null || !(key in data)) {
    return null;
  }

  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

@injectable()
export class UIEventBridge extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: TypedEventBusLike,
    @inject(TOKENS.uiEffects) private readonly uiEffects: UIEffectsLike,
    @inject(TOKENS.domBindings) private readonly domBindings: DomBindings,
    @inject(TOKENS.presentationModeService) private readonly presentationModeService: PresentationModeServiceLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'UIEventBridge');
  }

  initialize(): void {
    this.bindEventHandlers();
    this.logger.info('UIEventBridge initialized');
  }

  @OnEvent(EventChannels.UI.STREAMING_MODE)
  private _handleStreamingMode(data: UiStreamingModePayload): void {
    this.presentationModeService.handleStreamingMode(data.enabled);
  }

  @OnEvent(EventChannels.UI.SHUTTER_FLASH)
  private _handleShutterFlash(): void {
    this.uiEffects.triggerShutterFlash();
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_POP)
  private _handleRecordButtonPop(): void {
    this.uiEffects.triggerRecordButtonPop();
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_PRESS)
  private _handleRecordButtonPress(): void {
    this.uiEffects.triggerRecordButtonPress();
  }

  @OnEvent(EventChannels.UI.BUTTON_FEEDBACK)
  private _handleButtonFeedback(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as Partial<UiButtonFeedbackPayload>
      : {};
    if (!payload.elementKey) {
      return;
    }
    this.uiEffects.triggerButtonFeedback(
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
    this.uiEffects.setRecordingButtonState(this.domBindings.flat.recordBtn, active);
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_DISABLED)
  private _handleRecordButtonDisabled(): void {
    this._setRecordButtonDisabled(true);
  }

  @OnEvent(EventChannels.UI.RECORD_BUTTON_ENABLED)
  private _handleRecordButtonEnabled(): void {
    this._setRecordButtonDisabled(false);
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
    this.presentationModeService.handleFullscreenState(active);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.logger.info('UIEventBridge disposed');
    return disposed;
  }

  private _setRecordButtonDisabled(disabled: boolean): void {
    const recordBtn = this.domBindings.flat.recordBtn;
    if (!recordBtn) {
      return;
    }

    recordBtn.disabled = disabled;
    recordBtn.classList.toggle('disabled', disabled);
  }
}
