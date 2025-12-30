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

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

export class UIEventBridge extends BaseService {
  constructor(dependencies) {
    // loggerFactory is not required - will use BaseService's optional logger creation
    super(dependencies, ['eventBus', 'uiController', 'appState'], 'UIEventBridge');

    // Fallback to console if no logger was created
    if (!this.logger) {
      this.logger = console;
    }

    // Track subscriptions for cleanup
    this._subscriptions = [];

    // Local state tracking for cinematic mode gating
    this._cinematicModeEnabled = false;
    this._isStreaming = false;
  }

  /**
   * Initialize event subscriptions
   */
  initialize() {
    this._subscribeToEvents();
    this.logger.info('UIEventBridge initialized');
  }

  /**
   * Subscribe to all UI events
   * @private
   */
  _subscribeToEvents() {
    const eventHandlers = {
      // Status messages
      [EventChannels.UI.STATUS_MESSAGE]: (data) => this._handleStatusMessage(data),

      // Device status
      [EventChannels.UI.DEVICE_STATUS]: (data) => this._handleDeviceStatus(data),
      [EventChannels.UI.OVERLAY_MESSAGE]: (data) => this._handleOverlayMessage(data),
      [EventChannels.UI.OVERLAY_VISIBLE]: (data) => this._handleOverlayVisible(data),
      [EventChannels.UI.OVERLAY_ERROR]: (data) => this._handleOverlayError(data),

      // Streaming mode
      [EventChannels.UI.STREAMING_MODE]: (data) => this._handleStreamingMode(data),
      [EventChannels.UI.STREAM_INFO]: (data) => this._handleStreamInfo(data),

      // Visual effects
      [EventChannels.UI.SHUTTER_FLASH]: () => this._handleShutterFlash(),
      [EventChannels.UI.RECORD_BUTTON_POP]: () => this._handleRecordButtonPop(),
      [EventChannels.UI.RECORD_BUTTON_PRESS]: () => this._handleRecordButtonPress(),
      [EventChannels.UI.BUTTON_FEEDBACK]: (data) => this._handleButtonFeedback(data),

      // Recording state
      [EventChannels.UI.RECORDING_STATE]: (data) => this._handleRecordingState(data),

      // Settings events (translated to UI updates)
      [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]: (data) => this._handleCinematicMode(data),

      // Fullscreen
      [EventChannels.UI.FULLSCREEN_STATE]: (data) => this._handleFullscreenState(data)
    };

    // Subscribe to all events
    for (const [event, handler] of Object.entries(eventHandlers)) {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }

    // Initialize state from AppState (cinematic enabled by default, streaming false on startup)
    this._cinematicModeEnabled = this.appState?.cinematicModeEnabled ?? true;
    this._isStreaming = this.appState?.isStreaming ?? false;
  }

  _handleStatusMessage(data) {
    const { message, type = 'info' } = data;
    this.uiController.updateStatusMessage(message, type);
  }

  _handleDeviceStatus(data) {
    const { status } = data;
    this.uiController.updateDeviceStatus(status);
  }

  _handleOverlayMessage(data) {
    const { deviceConnected } = data;
    this.uiController.updateOverlayMessage(deviceConnected);
  }

  _handleOverlayVisible(data) {
    const { visible } = data;
    this.uiController.deviceStatus?.setOverlayVisible(visible);
  }

  _handleOverlayError(data) {
    const { message } = data;
    this.uiController.showErrorOverlay(message);
  }

  _handleStreamingMode(data) {
    const { enabled } = data;
    this._isStreaming = enabled;
    this.uiController.setStreamingMode(enabled);
    this._updateCinematicVisual();
  }

  _handleStreamInfo(data) {
    const { settings } = data;
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

  _handleButtonFeedback(data) {
    const { elementKey, className, duration } = data;
    this.uiController.triggerButtonFeedback(elementKey, className, duration);
  }

  _handleRecordingState(data) {
    const { active } = data;
    this.uiController.updateRecordingButtonState(active);
  }

  _handleCinematicMode(data) {
    const { enabled } = data;
    this._cinematicModeEnabled = enabled;
    this._updateCinematicVisual();
  }

  _updateCinematicVisual() {
    const isActive = this._cinematicModeEnabled && this._isStreaming;
    this.uiController.updateCinematicMode(isActive);
  }

  _handleFullscreenState(data) {
    const { active } = data;
    this.uiController.updateFullscreenButton(active);
    this.uiController.updateFullscreenMode(active);
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
