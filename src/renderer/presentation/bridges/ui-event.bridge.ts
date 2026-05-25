/**
 * UI Event Bridge
 *
 * Bridges between EventBus events and UIController
 * Decouples orchestrators from direct UI manipulation
 *
 * This class subscribes to UI-related events published by orchestrators
 * and delegates to UIController methods, providing a clean separation
 * between business logic and UI concerns.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import type {
  EventPayloadMap,
  TypedEventBusLike,
  UiButtonFeedbackPayload
} from '@shared/events/event-payloads.js';
import type { LoggerFactoryLike, LoggerLike } from '@shared/interfaces/infrastructure.types.js';

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
  declare protected readonly eventBus: TypedEventBusLike;
  declare protected readonly uiController: UiControllerLike;
  declare protected readonly presentationModeService: PresentationModeServiceLike;
  declare protected readonly logger: LoggerLike;

  _subscriptions: Array<() => void>;

  constructor(dependencies: UIEventBridgeDependencies) {
    super(dependencies, ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory'], 'UIEventBridge');

    // Track subscriptions for cleanup
    this._subscriptions = [];
  }

  /**
   * Initialize event subscriptions
   */
  initialize() {
    this._subscribeToEvents();
    this.logger.info('UIEventBridge initialized');
  }

  _subscribeToEvents() {
    const eventHandlers: Array<[keyof EventPayloadMap, (data?: unknown) => void]> = [
      // Status messages
      [EventChannels.UI.STATUS_MESSAGE, (data) => this._handleStatusMessage(data)],

      // Device status
      [EventChannels.UI.DEVICE_STATUS, (data) => this._handleDeviceStatus(data)],
      [EventChannels.UI.OVERLAY_MESSAGE, (data) => this._handleOverlayMessage(data)],
      [EventChannels.UI.OVERLAY_VISIBLE, (data) => this._handleOverlayVisible(data)],
      [EventChannels.UI.OVERLAY_ERROR, (data) => this._handleOverlayError(data)],

      // Streaming mode
      [EventChannels.UI.STREAMING_MODE, (data) => this._handleStreamingMode(data)],
      [EventChannels.UI.STREAM_INFO, (data) => this._handleStreamInfo(data)],

      // Visual effects
      [EventChannels.UI.SHUTTER_FLASH, () => this._handleShutterFlash()],
      [EventChannels.UI.RECORD_BUTTON_POP, () => this._handleRecordButtonPop()],
      [EventChannels.UI.RECORD_BUTTON_PRESS, () => this._handleRecordButtonPress()],
      [EventChannels.UI.BUTTON_FEEDBACK, (data) => this._handleButtonFeedback(data)],

      // Recording state
      [EventChannels.UI.RECORDING_STATE, (data) => this._handleRecordingState(data)],
      [EventChannels.UI.RECORD_BUTTON_DISABLED, () => this._handleRecordButtonDisabled()],
      [EventChannels.UI.RECORD_BUTTON_ENABLED, () => this._handleRecordButtonEnabled()],

      // Settings events (translated to UI updates)
      [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, (data) => this._handleCinematicMode(data)],
      [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, (enabled) =>
        this._handleMinimalistFullscreenChanged(enabled)],

      // Fullscreen
      [EventChannels.UI.FULLSCREEN_STATE, (data) => this._handleFullscreenState(data)]
    ];

    // Subscribe to all events
    for (const [event, handler] of eventHandlers) {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  _handleStatusMessage(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { message?: string; type?: string }
      : {};
    const message = typeof payload.message === 'string' ? payload.message : '';
    const type = payload.type ?? 'info';
    this.uiController.updateStatusMessage(message, type);
  }

  _handleDeviceStatus(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { status?: unknown }
      : {};
    const { status } = payload;
    this.uiController.updateDeviceStatus(status);
  }

  _handleOverlayMessage(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { deviceConnected?: unknown }
      : {};
    const deviceConnected = typeof payload.deviceConnected === 'boolean'
      ? payload.deviceConnected
      : undefined;
    this.uiController.updateOverlayMessage(deviceConnected);
  }

  _handleOverlayVisible(data: unknown) {
    const visible = getBooleanPayloadValue(data, 'visible');
    if (visible === null) {
      this.logger.warn('Ignoring invalid overlay visibility payload');
      return;
    }
    this.uiController.deviceStatus?.setOverlayVisible(visible);
  }

  _handleOverlayError(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { message?: unknown }
      : {};
    const message = typeof payload.message === 'string' ? payload.message : '';
    this.uiController.showErrorOverlay(message);
  }

  _handleStreamingMode(data: unknown) {
    const enabled = getBooleanPayloadValue(data, 'enabled');
    if (enabled === null) {
      this.logger.warn('Ignoring invalid streaming mode payload');
      return;
    }
    this.presentationModeService.handleStreamingMode(enabled);
  }

  _handleStreamInfo(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { settings?: unknown }
      : {};
    const { settings } = payload;
    this.uiController.updateStreamInfo(settings);
  }

  _handleShutterFlash() {
    this.uiController.triggerShutterFlash();
  }

  _handleRecordButtonPop() {
    this.uiController.triggerRecordButtonPop();
  }

  _handleRecordButtonPress() {
    this.uiController.triggerRecordButtonPress();
  }

  _handleButtonFeedback(data: unknown) {
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

  _handleRecordingState(data: unknown) {
    const active = getBooleanPayloadValue(data, 'active');
    if (active === null) {
      this.logger.warn('Ignoring invalid recording state payload');
      return;
    }
    this.uiController.updateRecordingButtonState(active);
  }

  _handleRecordButtonDisabled() {
    this.uiController.setRecordButtonDisabled(true);
  }

  _handleRecordButtonEnabled() {
    this.uiController.setRecordButtonDisabled(false);
  }

  _handleCinematicMode(data: unknown) {
    const enabled = getBooleanPayloadValue(data, 'enabled');
    if (enabled === null) {
      this.logger.warn('Ignoring invalid cinematic mode payload');
      return;
    }
    this.presentationModeService.handleCinematicModeChanged(enabled);
    // Show status message (moved from CinematicModeService for separation of concerns)
    this.uiController.updateStatusMessage(`Cinematic mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  _handleMinimalistFullscreenChanged(enabled: unknown) {
    if (typeof enabled !== 'boolean') {
      this.logger.warn('Ignoring invalid minimalist fullscreen payload');
      return;
    }
    this.presentationModeService.handleMinimalistFullscreenChanged(enabled);
  }

  _handleFullscreenState(data: unknown) {
    const active = getBooleanPayloadValue(data, 'active');
    if (active === null) {
      this.logger.warn('Ignoring invalid fullscreen state payload');
      return;
    }
    this.presentationModeService.handleFullscreenState(active);
  }

  /**
   * Dispose and cleanup subscriptions
   */
  dispose() {
    for (const unsubscribe of this._subscriptions) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this._subscriptions = [];
    this.logger.info('UIEventBridge disposed');
  }
}
