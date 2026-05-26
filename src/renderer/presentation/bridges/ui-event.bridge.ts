import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type {
  EventPayloadMap,
  TypedEventBusLike,
  UiButtonFeedbackPayload
} from '@shared/events/event-payloads.js';
import type { LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

type UiControllerLike = {
  updateStatusMessage(message: string, type?: string): void;
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
  handleCinematicModeChanged(enabled: boolean): void;
  handleMinimalistFullscreenChanged(enabled: boolean): void;
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
  protected readonly eventBus: TypedEventBusLike;
  private readonly uiController: UiControllerLike;
  private readonly presentationModeService: PresentationModeServiceLike;

  constructor(dependencies: UIEventBridgeDependencies) {
    super(dependencies, ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory'], 'UIEventBridge');

    this.eventBus = dependencies.eventBus;
    this.uiController = dependencies.uiController;
    this.presentationModeService = dependencies.presentationModeService;
  }

  initialize(): void {
    this._subscribeToEvents();
    this.logger.info('UIEventBridge initialized');
  }

  private _subscribeToEvents(): void {
    const eventHandlers: Array<[keyof EventPayloadMap, (data?: unknown) => void]> = [
      [EventChannels.UI.STATUS_MESSAGE, (data) => this._handleStatusMessage(data)],
      [EventChannels.UI.DEVICE_STATUS, (data) => this._handleDeviceStatus(data)],
      [EventChannels.UI.OVERLAY_MESSAGE, (data) => this._handleOverlayMessage(data)],
      [EventChannels.UI.OVERLAY_VISIBLE, (data) => this._handleOverlayVisible(data)],
      [EventChannels.UI.OVERLAY_ERROR, (data) => this._handleOverlayError(data)],
      [EventChannels.UI.STREAMING_MODE, (data) => this._handleStreamingMode(data)],
      [EventChannels.UI.STREAM_INFO, (data) => this._handleStreamInfo(data)],
      [EventChannels.UI.SHUTTER_FLASH, () => this._handleShutterFlash()],
      [EventChannels.UI.RECORD_BUTTON_POP, () => this._handleRecordButtonPop()],
      [EventChannels.UI.RECORD_BUTTON_PRESS, () => this._handleRecordButtonPress()],
      [EventChannels.UI.BUTTON_FEEDBACK, (data) => this._handleButtonFeedback(data)],
      [EventChannels.UI.RECORDING_STATE, (data) => this._handleRecordingState(data)],
      [EventChannels.UI.RECORD_BUTTON_DISABLED, () => this._handleRecordButtonDisabled()],
      [EventChannels.UI.RECORD_BUTTON_ENABLED, () => this._handleRecordButtonEnabled()],
      [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, (data) => this._handleCinematicMode(data)],
      [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, (enabled) =>
        this._handleMinimalistFullscreenChanged(enabled)],
      [EventChannels.UI.FULLSCREEN_STATE, (data) => this._handleFullscreenState(data)]
    ];

    for (const [event, handler] of eventHandlers) {
      this.listen(event, handler);
    }
  }

  private _handleStatusMessage(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as { message?: string; type?: string }
      : {};
    const message = typeof payload.message === 'string' ? payload.message : '';
    const type = payload.type ?? 'info';
    this.uiController.updateStatusMessage(message, type);
  }

  private _handleDeviceStatus(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as { status?: unknown }
      : {};
    const { status } = payload;
    this.uiController.updateDeviceStatus(status);
  }

  private _handleOverlayMessage(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as { deviceConnected?: unknown }
      : {};
    const deviceConnected = typeof payload.deviceConnected === 'boolean'
      ? payload.deviceConnected
      : undefined;
    this.uiController.updateOverlayMessage(deviceConnected);
  }

  private _handleOverlayVisible(data: unknown): void {
    const visible = getBooleanPayloadValue(data, 'visible');
    if (visible === null) {
      this.logger.warn('Ignoring invalid overlay visibility payload');
      return;
    }
    this.uiController.deviceStatus?.setOverlayVisible(visible);
  }

  private _handleOverlayError(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as { message?: unknown }
      : {};
    const message = typeof payload.message === 'string' ? payload.message : '';
    this.uiController.showErrorOverlay(message);
  }

  private _handleStreamingMode(data: unknown): void {
    const enabled = getBooleanPayloadValue(data, 'enabled');
    if (enabled === null) {
      this.logger.warn('Ignoring invalid streaming mode payload');
      return;
    }
    this.presentationModeService.handleStreamingMode(enabled);
  }

  private _handleStreamInfo(data: unknown): void {
    const payload = typeof data === 'object' && data !== null
      ? data as { settings?: unknown }
      : {};
    const { settings } = payload;
    this.uiController.updateStreamInfo(settings);
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
    this.presentationModeService.handleCinematicModeChanged(enabled);
    this.uiController.updateStatusMessage(`Cinematic mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  private _handleMinimalistFullscreenChanged(enabled: unknown): void {
    if (typeof enabled !== 'boolean') {
      this.logger.warn('Ignoring invalid minimalist fullscreen payload');
      return;
    }
    this.presentationModeService.handleMinimalistFullscreenChanged(enabled);
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
