/**
 * UI Event Handler
 *
 * Bridges between EventBus events and UIController
 * Decouples orchestrators from direct UI manipulation
 *
 * This class subscribes to UI-related events published by orchestrators
 * and delegates to UIController methods, providing a clean separation
 * between business logic and UI concerns.
 */

import { BaseService } from '@shared/base/service.js';
import { CSSClasses } from '@shared/config/css-classes.js';

export class UIEventHandler extends BaseService {
  constructor(dependencies) {
    // loggerFactory is not required - will use BaseService's optional logger creation
    super(dependencies, ['eventBus', 'uiController'], 'UIEventHandler');

    // Fallback to console if no logger was created
    if (!this.logger) {
      this.logger = console;
    }

    // Track subscriptions for cleanup
    this._subscriptions = [];
  }

  /**
   * Initialize event subscriptions
   */
  initialize() {
    this._subscribeToEvents();
    this.logger.info('UIEventHandler initialized');
  }

  /**
   * Subscribe to all UI events
   * @private
   */
  _subscribeToEvents() {
    const eventHandlers = {
      // Status messages
      'ui:status-message': (data) => this._handleStatusMessage(data),

      // Device status
      'ui:device-status': (data) => this._handleDeviceStatus(data),
      'ui:overlay-message': (data) => this._handleOverlayMessage(data),
      'ui:overlay-visible': (data) => this._handleOverlayVisible(data),
      'ui:overlay-error': (data) => this._handleOverlayError(data),

      // Streaming mode
      'ui:streaming-mode': (data) => this._handleStreamingMode(data),
      'ui:stream-info': (data) => this._handleStreamInfo(data),

      // Visual effects
      'ui:shutter-flash': () => this._handleShutterFlash(),
      'ui:record-button-pop': () => this._handleRecordButtonPop(),
      'ui:record-button-press': () => this._handleRecordButtonPress(),
      'ui:button-feedback': (data) => this._handleButtonFeedback(data),

      // Recording state
      'ui:recording-state': (data) => this._handleRecordingState(data),

      // Volume
      'ui:volume-level': (data) => this._handleVolumeLevel(data),
      'ui:volume-slider-visible': (data) => this._handleVolumeSliderVisible(data),

      // Cinematic mode
      'ui:cinematic-mode': (data) => this._handleCinematicMode(data),

      // Fullscreen
      'ui:fullscreen-state': (data) => this._handleFullscreenState(data)
    };

    // Subscribe to all events
    for (const [event, handler] of Object.entries(eventHandlers)) {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  // =====================================================
  // Event Handlers - Status & Messages
  // =====================================================

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

  // =====================================================
  // Event Handlers - Streaming
  // =====================================================

  _handleStreamingMode(data) {
    const { enabled } = data;
    this.uiController.setStreamingMode(enabled);
  }

  _handleStreamInfo(data) {
    const { settings } = data;
    this.uiController.updateStreamInfo(settings);
  }

  // =====================================================
  // Event Handlers - Visual Effects
  // =====================================================

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

  // =====================================================
  // Event Handlers - Recording State
  // =====================================================

  _handleRecordingState(data) {
    const { active } = data;
    const recordBtn = this.uiController.elements.recordBtn;
    if (recordBtn) {
      if (active) {
        recordBtn.classList.add(CSSClasses.RECORDING);
      } else {
        recordBtn.classList.remove(CSSClasses.RECORDING);
      }
    }
  }

  // =====================================================
  // Event Handlers - Volume
  // =====================================================

  _handleVolumeLevel(data) {
    const { level } = data;
    this.uiController.setVolume(level);
  }

  _handleVolumeSliderVisible(data) {
    const { visible } = data;
    this.uiController.toggleVolumeSlider(visible);
  }

  // =====================================================
  // Event Handlers - Modes
  // =====================================================

  _handleCinematicMode(data) {
    const { enabled } = data;
    // Toggle cinematic mode body class directly
    if (enabled) {
      document.body.classList.add(CSSClasses.CINEMATIC_ACTIVE);
    } else {
      document.body.classList.remove(CSSClasses.CINEMATIC_ACTIVE);
    }
  }

  _handleFullscreenState(data) {
    const { active } = data;
    this.uiController.updateFullscreenButton(active);
  }

  // =====================================================
  // Cleanup
  // =====================================================

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
    this.logger.info('UIEventHandler disposed');
  }
}
