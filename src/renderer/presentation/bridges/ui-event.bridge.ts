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

import { LifecycleService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

export class UIEventBridge extends LifecycleService {
  static readonly dependencies = ['eventBus', 'uiController', 'uiEffects', 'presentationModeService', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...UIEventBridge.dependencies], 'UIEventBridge');
  }

  /**
   * Initialize event subscriptions
   */
  async onInitialize() {
    this.subscribeWithCleanup({
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

      // Settings events (translated to UI updates)
      [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]: (data) => this._handleCinematicMode(data),
      [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED]: (enabled) => this._handleMinimalistFullscreenChanged(enabled),

      // Fullscreen
      [EventChannels.UI.FULLSCREEN_STATE]: (data) => this._handleFullscreenState(data)
    });

    this.logger.info('UIEventBridge initialized');
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
    this.presentationModeService.handleStreamingMode(enabled);
  }

  _handleStreamInfo(data) {
    const { settings } = data;
    this.uiController.updateStreamInfo(settings);
  }

  _handleCinematicMode(data) {
    const { enabled } = data;
    this.presentationModeService.handleCinematicModeChanged(enabled);
    // Show status message (moved from CinematicModeService for separation of concerns)
    this.uiController.updateStatusMessage(`Cinematic mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  _handleMinimalistFullscreenChanged(enabled) {
    this.presentationModeService.handleMinimalistFullscreenChanged(enabled);
  }

  _handleFullscreenState(data) {
    const { active } = data;
    this.presentationModeService.handleFullscreenState(active);
  }

  async onDispose() {
    this.logger.info('UIEventBridge disposed');
  }
}
