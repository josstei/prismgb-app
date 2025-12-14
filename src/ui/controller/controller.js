/**
 * UI Controller - Thin facade for UI operations
 * Delegates to UIComponentRegistry and UIEffects for actual work
 */

import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { DOMSelectors } from '@shared/config/dom-selectors.js';

class UIController {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {UIComponentRegistry} dependencies.uiComponentRegistry - Manages UI components
   * @param {UIEffects} dependencies.uiEffects - Visual effects manager
   * @param {LoggerFactory} dependencies.loggerFactory - Creates logger instances
   */
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
   * Initialize DOM element references
   * @returns {Object} Map of element keys to DOM elements
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
      shaderBtn: document.getElementById(DOMSelectors.SHADER_BTN),

      // Shader selector and toolbar
      shaderControls: document.getElementById(DOMSelectors.SHADER_CONTROLS),
      shaderDropdown: document.getElementById(DOMSelectors.SHADER_DROPDOWN),
      streamToolbar: document.getElementById(DOMSelectors.STREAM_TOOLBAR),
      cinematicToggle: document.getElementById(DOMSelectors.CINEMATIC_TOGGLE),
      brightnessSlider: document.getElementById(DOMSelectors.BRIGHTNESS_SLIDER),
      brightnessPercentage: document.getElementById(DOMSelectors.BRIGHTNESS_PERCENTAGE),
      volumeSliderVertical: document.getElementById(DOMSelectors.VOLUME_SLIDER_VERTICAL),
      volumePercentageVertical: document.getElementById(DOMSelectors.VOLUME_PERCENTAGE_VERTICAL),

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
      footer: document.querySelector('.footer'),

      // Fullscreen controls
      fullscreenControls: document.getElementById(DOMSelectors.FULLSCREEN_CONTROLS),
      fsExitBtn: document.getElementById(DOMSelectors.FS_EXIT_BTN),

      // Stream container
      streamContainer: document.getElementById(DOMSelectors.STREAM_CONTAINER)
    };
  }

  /**
   * Initialize UI component instances
   */
  initializeComponents() {
    if (this.registry) {
      this.registry.initialize(this.elements);
    }
  }

  /**
   * Initialize settings menu component
   * @param {Object} dependencies - Dependencies object
   * @param {SettingsService} dependencies.settingsService - Settings service
   * @param {EventBus} dependencies.eventBus - Event bus instance
   * @param {Logger} dependencies.logger - Logger instance
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
   * Initialize shader selector component
   * @param {Object} dependencies - Dependencies object
   * @param {SettingsService} dependencies.settingsService - Settings service
   * @param {Logger} dependencies.logger - Logger instance
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

  /**
   * Update status bar message
   * @param {string} message - Message to display
   * @param {string} [type='info'] - Message type (info, error, success)
   */
  updateStatusMessage(message, type = 'info') {
    this.registry?.get('statusNotificationComponent')?.show(message, type);
  }

  /**
   * Update device status indicator
   * @param {Object} status - Device status object
   */
  updateDeviceStatus(status) {
    this.registry?.get('deviceStatusComponent')?.updateStatus(status);
  }

  /**
   * Update overlay message based on device state
   * @param {boolean} deviceConnected - Whether device is connected
   */
  updateOverlayMessage(deviceConnected) {
    this.registry?.get('deviceStatusComponent')?.updateOverlayMessage(deviceConnected);
  }

  /**
   * Get device status component for direct access
   * @returns {DeviceStatusComponent|undefined} Device status component instance
   */
  get deviceStatus() {
    return this.registry?.get('deviceStatusComponent');
  }

  /**
   * Set streaming mode UI state
   * @param {boolean} isStreaming - Whether streaming is active
   */
  setStreamingMode(isStreaming) {
    this.registry?.get('streamControlsComponent')?.setStreamingMode(isStreaming);
    if (isStreaming) {
      this.effects?.enableCursorAutoHide();
    } else {
      this.effects?.disableCursorAutoHide();
      this.registry?.get('shaderSelectorComponent')?.hide?.();
    }
  }

  /**
   * Update stream info display
   * @param {Object} settings - Stream settings
   */
  updateStreamInfo(settings) {
    this.registry?.get('streamControlsComponent')?.updateStreamInfo(settings);
  }

  /**
   * Show error message on overlay
   * @param {string} message - Error message
   */
  showErrorOverlay(message) {
    this.registry?.get('deviceStatusComponent')?.showError(message);
  }

  /**
   * Update fullscreen button state
   * @param {boolean} isFullscreen - Whether in fullscreen mode
   */
  updateFullscreenButton(isFullscreen) {
    if (this.elements.fullscreenBtn) {
      this.elements.fullscreenBtn.title = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen';
    }
  }

  /**
   * Trigger shutter flash effect
   */
  triggerShutterFlash() {
    this.effects?.triggerShutterFlash();
  }

  /**
   * Trigger record button pop animation
   */
  triggerRecordButtonPop() {
    this.effects?.triggerRecordButtonPop();
  }

  /**
   * Trigger record button press animation
   */
  triggerRecordButtonPress() {
    this.effects?.triggerRecordButtonPress();
  }

  /**
   * Trigger button feedback animation
   * @param {string} elementKey - Element key from elements map
   * @param {string} className - CSS class to apply
   * @param {number} duration - Animation duration in milliseconds
   */
  triggerButtonFeedback(elementKey, className, duration) {
    this.effects?.triggerButtonFeedback(elementKey, className, duration);
  }

  /**
   * Enable fullscreen controls auto-hide
   */
  enableControlsAutoHide() {
    this.effects?.enableControlsAutoHide(this.elements.fullscreenControls);
  }

  /**
   * Disable fullscreen controls auto-hide
   */
  disableControlsAutoHide() {
    this.effects?.disableControlsAutoHide();
  }

  /**
   * Get fullscreen controls element
   * @returns {HTMLElement|null} Fullscreen controls DOM element
   */
  getFullscreenControls() {
    return this.elements.fullscreenControls;
  }

  /**
   * Enable header auto-hide (legacy method for backwards compatibility)
   * @deprecated Use enableControlsAutoHide instead
   */
  enableHeaderAutoHide() {
    this.enableControlsAutoHide();
  }

  /**
   * Disable header auto-hide (legacy method for backwards compatibility)
   * @deprecated Use disableControlsAutoHide instead
   */
  disableHeaderAutoHide() {
    this.disableControlsAutoHide();
  }

  /**
   * Add event listener helper
   * @param {string} elementKey - Element key from elements map
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  on(elementKey, event, handler) {
    const element = this.elements[elementKey];
    if (element) {
      this._domListeners.add(element, event, handler);
    } else {
      this.logger?.warn(`Element not found: ${elementKey}`);
    }
  }

  /**
   * Dispose and cleanup all resources
   */
  dispose() {
    // Clean up effects (cursor auto-hide listener/timer)
    this.effects?.dispose();

    // Clean up registry components
    this.registry?.dispose();

    // Clean up tracked event listeners
    this._domListeners.removeAll();
  }
}

export { UIController };
