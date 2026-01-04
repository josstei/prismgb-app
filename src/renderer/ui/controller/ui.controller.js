/**
 * UI Controller - Thin facade for UI operations
 * Delegates to UIComponentRegistry and UIEffects for actual work
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { DOMSelectors } from '@shared/config/dom-selectors.config.js';
import { downloadFile } from '@renderer/lib/file-download.utils.js';

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
      settingFullscreenOnStartup: document.getElementById(DOMSelectors.SETTING_FULLSCREEN_ON_STARTUP),
      settingMinimalistFullscreen: document.getElementById(DOMSelectors.SETTING_MINIMALIST_FULLSCREEN),
      settingAnimationSaver: document.getElementById(DOMSelectors.SETTING_ANIMATION_SAVER),
      settingRenderPreset: document.getElementById(DOMSelectors.SETTING_RENDER_PRESET),
      disclaimerBtn: document.getElementById(DOMSelectors.DISCLAIMER_BTN),
      disclaimerContent: document.getElementById(DOMSelectors.DISCLAIMER_CONTENT),
      footer: document.querySelector('.footer'),

      // Fullscreen controls
      fullscreenControls: document.getElementById(DOMSelectors.FULLSCREEN_CONTROLS),
      fsExitBtn: document.getElementById(DOMSelectors.FS_EXIT_BTN),

      // Stream container
      streamContainer: document.getElementById(DOMSelectors.STREAM_CONTAINER),

      // Notes panel
      notesBtn: document.getElementById(DOMSelectors.NOTES_BTN),
      notesPanel: document.getElementById(DOMSelectors.NOTES_PANEL),
      notesSearchInput: document.getElementById(DOMSelectors.NOTES_SEARCH_INPUT),
      notesGameFilter: document.getElementById(DOMSelectors.NOTES_GAME_FILTER),
      notesListToggle: document.getElementById(DOMSelectors.NOTES_LIST_TOGGLE),
      notesList: document.getElementById(DOMSelectors.NOTES_LIST),
      notesEditor: document.getElementById(DOMSelectors.NOTES_EDITOR),
      notesEmptyState: document.getElementById(DOMSelectors.NOTES_EMPTY_STATE),
      notesGameAddBtn: document.getElementById(DOMSelectors.NOTES_GAME_ADD_BTN),
      notesGameTagRow: document.getElementById(DOMSelectors.NOTES_GAME_TAG_ROW),
      notesGameTag: document.getElementById(DOMSelectors.NOTES_GAME_TAG),
      notesGameInput: document.getElementById(DOMSelectors.NOTES_GAME_INPUT),
      notesGameAutocomplete: document.getElementById(DOMSelectors.NOTES_GAME_AUTOCOMPLETE),
      notesTitleInput: document.getElementById(DOMSelectors.NOTES_TITLE_INPUT),
      notesContentArea: document.getElementById(DOMSelectors.NOTES_CONTENT_AREA),
      notesNewBtn: document.getElementById(DOMSelectors.NOTES_NEW_BTN),
      notesDeleteBtn: document.getElementById(DOMSelectors.NOTES_DELETE_BTN)
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
   * Initialize notes panel component
   * @param {Object} dependencies - Dependencies object
   * @param {NotesService} dependencies.notesService - Notes service
   * @param {Logger} dependencies.logger - Logger instance
   * @param {Object} elements - DOM element references for the notes panel
   */
  initNotesPanel(dependencies, elements) {
    if (this.registry) {
      this.registry.initNotesPanel(dependencies, elements);
    }
  }

  /**
   * Toggle notes panel visibility
   */
  toggleNotesPanel() {
    const notesPanel = this.registry?.get('notesPanelComponent');
    notesPanel?.toggle();
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
      this.effects?.enableToolbarAutoHide(this.elements.streamToolbar);
      this.effects?.enableCursorAutoHide();
    } else {
      this.effects?.disableCursorAutoHide();
      this.effects?.disableToolbarAutoHide();
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
   * Update fullscreen mode visual state (body class)
   * @param {boolean} isActive - Whether fullscreen mode is active
   */
  updateFullscreenMode(isActive) {
    this.effects?.setFullscreenMode(isActive);
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
   * Update recording button state
   * @param {boolean} isActive - Whether recording is active
   */
  updateRecordingButtonState(isActive) {
    const recordBtn = this.elements.recordBtn;
    if (recordBtn) {
      this.effects?.setRecordingButtonState(recordBtn, isActive);
    }
  }

  /**
   * Update cinematic mode visual state
   * @param {boolean} isActive - Whether cinematic mode should be visually active
   */
  updateCinematicMode(isActive) {
    this.effects?.setCinematicMode(isActive);
  }

  /**
   * Update minimalist fullscreen visual state
   * @param {boolean} isActive - Whether minimalist fullscreen should be visually active
   */
  updateMinimalistFullscreen(isActive) {
    this.effects?.setMinimalistFullscreen(isActive);
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
   * Get stream canvas element
   * @returns {HTMLCanvasElement|null} Stream canvas DOM element
   */
  getStreamCanvas() {
    return this.elements.streamCanvas;
  }

  /**
   * Set stream canvas element (used when canvas is recreated for WebGPU)
   * @param {HTMLCanvasElement} canvas - The new canvas element
   */
  setStreamCanvas(canvas) {
    this.elements.streamCanvas = canvas;
  }

  /**
   * Get stream video element
   * @returns {HTMLVideoElement|null} Stream video DOM element
   */
  getStreamVideo() {
    return this.elements.streamVideo;
  }

  /**
   * Trigger a file download
   * @param {Blob} blob - File data to download
   * @param {string} filename - Name for the downloaded file
   */
  triggerDownload(blob, filename) {
    downloadFile(blob, filename);
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
