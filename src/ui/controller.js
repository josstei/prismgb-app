/**
 * UI Controller - Thin facade for UI operations
 * Delegates to UIComponentRegistry and UIEffects for actual work
 */

import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { DOMSelectors } from '@shared/config/dom-selectors.js';

class UIController {
  constructor(dependencies = {}) {
    const { uiComponentRegistry, uiEffects, loggerFactory } = dependencies;

    // Store references
    this.registry = uiComponentRegistry;
    this.effects = uiEffects;
    this.logger = loggerFactory?.create('UIController') || null;

    // Initialize all DOM element references (centralized)
    this.elements = this.initializeElements();

    // Track event listeners for cleanup
    this._domListeners = createDomListenerManager({ logger: this.logger });
  }

  /**
   * Initialize all DOM element references
   */
  initializeElements() {
    return {
      // Status and header
      statusIndicator: document.getElementById(DOMSelectors.STATUS_INDICATOR),
      statusText: document.getElementById(DOMSelectors.STATUS_TEXT),
      statusMessage: document.getElementById(DOMSelectors.STATUS_MESSAGE),

      // Video elements
      streamVideo: document.getElementById(DOMSelectors.STREAM_VIDEO),
      streamCanvas: document.getElementById(DOMSelectors.STREAM_CANVAS),
      streamOverlay: document.getElementById(DOMSelectors.STREAM_OVERLAY),
      overlayMessage: document.getElementById(DOMSelectors.OVERLAY_MESSAGE),

      // Control buttons
      settingsBtn: document.getElementById(DOMSelectors.SETTINGS_BTN),
      screenshotBtn: document.getElementById(DOMSelectors.SCREENSHOT_BTN),
      recordBtn: document.getElementById(DOMSelectors.RECORD_BTN),
      fullscreenBtn: document.getElementById(DOMSelectors.FULLSCREEN_BTN),
      volumeBtn: document.getElementById(DOMSelectors.VOLUME_BTN),
      cinematicBtn: document.getElementById(DOMSelectors.CINEMATIC_BTN),
      shaderBtn: document.getElementById(DOMSelectors.SHADER_BTN),

      // Shader selector and toolbar
      shaderDropdown: document.getElementById(DOMSelectors.SHADER_DROPDOWN),
      streamToolbar: document.getElementById(DOMSelectors.STREAM_TOOLBAR),
      cinematicToggle: document.getElementById(DOMSelectors.CINEMATIC_TOGGLE),

      // Volume controls
      volumeSlider: document.getElementById(DOMSelectors.VOLUME_SLIDER),
      volumeSliderContainer: document.getElementById(DOMSelectors.VOLUME_SLIDER_CONTAINER),
      volumePercentage: document.getElementById(DOMSelectors.VOLUME_PERCENTAGE),
      volumeWave1: document.getElementById(DOMSelectors.VOLUME_WAVE_1),
      volumeWave2: document.getElementById(DOMSelectors.VOLUME_WAVE_2),

      // Device info
      deviceName: document.getElementById(DOMSelectors.DEVICE_NAME),
      deviceStatusText: document.getElementById(DOMSelectors.DEVICE_STATUS_TEXT),
      currentResolution: document.getElementById(DOMSelectors.CURRENT_RESOLUTION),
      currentFPS: document.getElementById(DOMSelectors.CURRENT_FPS),

      // Settings menu
      settingsMenuContainer: document.getElementById(DOMSelectors.SETTINGS_MENU_CONTAINER),
      settingStatusStrip: document.getElementById(DOMSelectors.SETTING_STATUS_STRIP),
      settingRenderPreset: document.getElementById(DOMSelectors.SETTING_RENDER_PRESET),
      disclaimerBtn: document.getElementById(DOMSelectors.DISCLAIMER_BTN),
      disclaimerContent: document.getElementById(DOMSelectors.DISCLAIMER_CONTENT),
      footer: document.querySelector('.footer')
    };
  }

  /**
   * Initialize components via registry
   */
  initializeComponents() {
    if (this.registry) {
      this.registry.initialize(this.elements);
    }
  }

  /**
   * Initialize settings menu component with dependencies
   * @param {Object} dependencies - { settingsService, eventBus, logger }
   */
  initSettingsMenu(dependencies) {
    if (this.registry) {
      this.registry.initSettingsMenu(dependencies);
      const settingsMenu = this.registry.get('settingsMenuComponent');
      if (settingsMenu) {
        settingsMenu.initialize(this.elements);
      }
    }
  }

  /**
   * Toggle settings menu visibility
   */
  toggleSettingsMenu() {
    const settingsMenu = this.registry?.get('settingsMenuComponent');
    settingsMenu?.toggle();
  }

  /**
   * Initialize shader selector component with dependencies
   * @param {Object} dependencies - { settingsService, logger }
   * @param {Object} elements - DOM element references for the shader panel
   */
  initShaderSelector(dependencies, elements) {
    if (this.registry) {
      this.registry.initShaderSelector(dependencies, elements);
    }
  }

  /**
   * Toggle shader selector visibility
   */
  toggleShaderSelector() {
    const shaderSelector = this.registry?.get('shaderSelectorComponent');
    shaderSelector?.toggle();
  }

  // =====================================================
  // Delegation to Components
  // =====================================================

  /** Update status message (delegates to StatusNotificationComponent) */
  updateStatusMessage(message, type = 'info') {
    this.registry?.get('statusNotificationComponent')?.show(message, type);
  }

  /** Update device status (delegates to DeviceStatusComponent) */
  updateDeviceStatus(status) {
    this.registry?.get('deviceStatusComponent')?.updateStatus(status);
  }

  /** Update overlay message (delegates to DeviceStatusComponent) */
  updateOverlayMessage(deviceConnected) {
    this.registry?.get('deviceStatusComponent')?.updateOverlayMessage(deviceConnected);
  }

  /** Get device status component for direct access */
  get deviceStatus() {
    return this.registry?.get('deviceStatusComponent');
  }

  /** Set volume (delegates to VolumeControl) */
  setVolume(volume) {
    this.registry?.get('volumeControl')?.setVolume(volume);
  }

  /** Toggle volume slider visibility */
  toggleVolumeSlider(show) {
    const volumeControl = this.registry?.get('volumeControl');
    if (show) {
      volumeControl?.showSlider();
    } else {
      volumeControl?.hideSlider();
    }
  }

  /** Check if volume slider is visible */
  isVolumeSliderVisible() {
    const container = this.elements.volumeSliderContainer;
    return container?.classList?.contains('visible') ?? false;
  }

  /** Set streaming mode (delegates to StreamControlsComponent) */
  setStreamingMode(isStreaming) {
    this.registry?.get('streamControlsComponent')?.setStreamingMode(isStreaming);
  }

  /** Update stream info display */
  updateStreamInfo(settings) {
    this.registry?.get('streamControlsComponent')?.updateStreamInfo(settings);
  }

  /** Show error overlay (delegates to DeviceStatusComponent) */
  showErrorOverlay(message) {
    this.registry?.get('deviceStatusComponent')?.showError(message);
  }

  /** Toggle fullscreen button title */
  updateFullscreenButton(isFullscreen) {
    if (this.elements.fullscreenBtn) {
      this.elements.fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    }
  }

  // =====================================================
  // Delegation to Effects
  // =====================================================

  /** Trigger shutter flash effect */
  triggerShutterFlash() {
    this.effects?.triggerShutterFlash();
  }

  /** Trigger record button pop effect */
  triggerRecordButtonPop() {
    this.effects?.triggerRecordButtonPop();
  }

  /** Trigger record button press effect */
  triggerRecordButtonPress() {
    this.effects?.triggerRecordButtonPress();
  }

  /** Trigger button feedback animation */
  triggerButtonFeedback(elementKey, className, duration) {
    this.effects?.triggerButtonFeedback(elementKey, className, duration);
  }

  // =====================================================
  // Event Listener Helper
  // =====================================================

  /** Add event listener helper (tracked for cleanup) */
  on(elementKey, event, handler) {
    const element = this.elements[elementKey];
    if (element) {
      this._domListeners.add(element, event, handler);
    } else {
      this.logger?.warn(`Element not found: ${elementKey}`);
    }
  }

  // =====================================================
  // Cleanup
  // =====================================================

  /** Dispose and cleanup all tracked resources */
  dispose() {
    // Clean up registry components
    this.registry?.dispose();

    // Clean up tracked event listeners
    this._domListeners.removeAll();
  }
}

// Export for ESM
export { UIController };
