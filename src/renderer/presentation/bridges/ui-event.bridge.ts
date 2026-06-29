import { BaseService, type ServiceEventDescriptor } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type {
  TypedEventBusLike,
  UiButtonFeedbackPayload
} from '@prismgb/events';
import type { LoggerFactoryLike } from '@prismgb/core';

type UiControllerLike = {
  updateDeviceStatus(status: unknown): void;
  updateOverlayMessage(deviceConnected?: boolean): void;
  showErrorOverlay(message: string): void;
  updateStreamInfo(settings: unknown): void;
  triggerShutterFlash(): void;
  triggerRecordButtonPop(): void;
  triggerRecordButtonPress(): void;
  triggerButtonFeedback(elementKey: string, className: string, duration: number): void;
  updateRecordingButtonState(active: boolean): void;
  setRecordButtonDisabled(disabled: boolean): void;
  deviceStatus?: {
    setOverlayVisible(visible: boolean): void;
  } | null;
};

type PresentationModeServiceLike = {
  handleStreamingMode(enabled: boolean): void;
  handleFullscreenState(active: boolean): void;
};

type UIEventBridgeDependencies = {
  eventBus: TypedEventBusLike;
  uiController: UiControllerLike;
  presentationModeService: PresentationModeServiceLike;
  loggerFactory: LoggerFactoryLike;
};

function getBooleanPayloadValue(data: unknown, key: string): boolean | null {
  if (typeof data !== 'object' || data === null || !(key in data)) {
    return null;
  }

  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}

export class UIEventBridge extends BaseService {
  private static readonly eventDescriptors = [
    [EventChannels.UI.STREAMING_MODE, (bridge, data) => bridge._handleStreamingMode(data)],
    [EventChannels.UI.SHUTTER_FLASH, (bridge) => bridge._handleShutterFlash()],
    [EventChannels.UI.RECORD_BUTTON_POP, (bridge) => bridge._handleRecordButtonPop()],
    [EventChannels.UI.RECORD_BUTTON_PRESS, (bridge) => bridge._handleRecordButtonPress()],
    [EventChannels.UI.BUTTON_FEEDBACK, (bridge, data) => bridge._handleButtonFeedback(data)],
    [EventChannels.UI.RECORDING_STATE, (bridge, data) => bridge._handleRecordingState(data)],
    [EventChannels.UI.RECORD_BUTTON_DISABLED, (bridge) => bridge._handleRecordButtonDisabled()],
    [EventChannels.UI.RECORD_BUTTON_ENABLED, (bridge) => bridge._handleRecordButtonEnabled()],
    [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, (bridge, data) => bridge._handleCinematicMode(data)],
    [EventChannels.UI.FULLSCREEN_STATE, (bridge, data) => bridge._handleFullscreenState(data)]
  ] satisfies readonly ServiceEventDescriptor<UIEventBridge>[];

  protected readonly eventBus: TypedEventBusLike;
  private readonly uiController: UiControllerLike;
  private readonly presentationModeService: PresentationModeServiceLike;

  constructor(dependencies: UIEventBridgeDependencies) {
    super(dependencies, 'UIEventBridge');

    this.eventBus = dependencies.eventBus;
    this.uiController = dependencies.uiController;
    this.presentationModeService = dependencies.presentationModeService;
  }

  initialize(): void {
    this.listenToDescriptors(UIEventBridge.eventDescriptors);
    this.logger.info('UIEventBridge initialized');
  }

  private _handleStreamingMode(data: unknown): void {
    const enabled = getBooleanPayloadValue(data, 'enabled');
    if (enabled === null) {
      this.logger.warn('Ignoring invalid streaming mode payload');
      return;
    }
    this.presentationModeService.handleStreamingMode(enabled);
  }


  private _handleShutterFlash(): void {
    this.uiController.triggerShutterFlash();
  }

  private _handleRecordButtonPop(): void {
    this.uiController.triggerRecordButtonPop();
  }

  private _handleRecordButtonPress(): void {
    this.uiController.triggerRecordButtonPress();
  }

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

  private _handleRecordingState(data: unknown): void {
    const active = getBooleanPayloadValue(data, 'active');
    if (active === null) {
      this.logger.warn('Ignoring invalid recording state payload');
      return;
    }
    this.uiController.updateRecordingButtonState(active);
  }

  private _handleRecordButtonDisabled(): void {
    this.uiController.setRecordButtonDisabled(true);
  }

  private _handleRecordButtonEnabled(): void {
    this.uiController.setRecordButtonDisabled(false);
  }

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
}
