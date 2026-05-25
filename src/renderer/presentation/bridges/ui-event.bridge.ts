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

export class UIEventBridge extends BaseService {
  _subscriptions: Array<() => void>;

  constructor(dependencies: Record<string, unknown>) {
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
    const eventHandlers = {
      // Status messages
      [EventChannels.UI.STATUS_MESSAGE]: (data: unknown) => this._handleStatusMessage(data),

      // Device status
      [EventChannels.UI.DEVICE_STATUS]: (data: unknown) => this._handleDeviceStatus(data),
      [EventChannels.UI.OVERLAY_MESSAGE]: (data: unknown) => this._handleOverlayMessage(data),
      [EventChannels.UI.OVERLAY_VISIBLE]: (data: unknown) => this._handleOverlayVisible(data),
      [EventChannels.UI.OVERLAY_ERROR]: (data: unknown) => this._handleOverlayError(data),

      // Streaming mode
      [EventChannels.UI.STREAMING_MODE]: (data: unknown) => this._handleStreamingMode(data),
      [EventChannels.UI.STREAM_INFO]: (data: unknown) => this._handleStreamInfo(data),

      // Visual effects
      [EventChannels.UI.SHUTTER_FLASH]: () => this._handleShutterFlash(),
      [EventChannels.UI.RECORD_BUTTON_POP]: () => this._handleRecordButtonPop(),
      [EventChannels.UI.RECORD_BUTTON_PRESS]: () => this._handleRecordButtonPress(),
      [EventChannels.UI.BUTTON_FEEDBACK]: (data: unknown) => this._handleButtonFeedback(data),

      // Recording state
      [EventChannels.UI.RECORDING_STATE]: (data: unknown) => this._handleRecordingState(data),
      [EventChannels.UI.RECORD_BUTTON_DISABLED]: () => this._handleRecordButtonDisabled(),
      [EventChannels.UI.RECORD_BUTTON_ENABLED]: () => this._handleRecordButtonEnabled(),

      // Settings events (translated to UI updates)
      [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]: (data: unknown) => this._handleCinematicMode(data),
      [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED]: (enabled: unknown) =>
        this._handleMinimalistFullscreenChanged(enabled),

      // Fullscreen
      [EventChannels.UI.FULLSCREEN_STATE]: (data: unknown) => this._handleFullscreenState(data)
    };

    // Subscribe to all events
    for (const [event, handler] of Object.entries(eventHandlers)) {
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
    const payload = typeof data === 'object' && data !== null
      ? data as { visible?: unknown }
      : {};
    const visible = Boolean(payload.visible);
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
    const payload = typeof data === 'object' && data !== null
      ? data as { enabled?: unknown }
      : {};
    this.presentationModeService.handleStreamingMode(Boolean(payload.enabled));
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
      ? data as { elementKey?: string; className?: string; duration?: number }
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
    const payload = typeof data === 'object' && data !== null
      ? data as { active?: unknown }
      : {};
    this.uiController.updateRecordingButtonState(Boolean(payload.active));
  }

  _handleRecordButtonDisabled() {
    this.uiController.setRecordButtonDisabled(true);
  }

  _handleRecordButtonEnabled() {
    this.uiController.setRecordButtonDisabled(false);
  }

  _handleCinematicMode(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { enabled?: unknown }
      : {};
    const enabled = Boolean(payload.enabled);
    this.presentationModeService.handleCinematicModeChanged(enabled);
    // Show status message (moved from CinematicModeService for separation of concerns)
    this.uiController.updateStatusMessage(`Cinematic mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  _handleMinimalistFullscreenChanged(enabled: unknown) {
    this.presentationModeService.handleMinimalistFullscreenChanged(Boolean(enabled));
  }

  _handleFullscreenState(data: unknown) {
    const payload = typeof data === 'object' && data !== null
      ? data as { active?: unknown }
      : {};
    this.presentationModeService.handleFullscreenState(Boolean(payload.active));
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
