/**
 * UI Controller - Thin facade for UI operations
 * Delegates to UIComponentRegistry and UIEffects for actual work
 */

import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';
import { downloadFile } from '@renderer/common/lib/file-download.utils';
import { createDomBindings } from '@renderer/presentation/primitives/dom-bindings.utils.js';

class UIController {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {UIComponentRegistry} dependencies.uiComponentRegistry - Manages UI components
   * @param {UIEffects} dependencies.uiEffects - Visual effects manager
   * @param {LoggerFactory} dependencies.loggerFactory - Creates logger instances
   * @param {BodyClassManager} dependencies.bodyClassManager - Manages body class state
   */
  constructor(dependencies = {}) {
    const { uiComponentRegistry, uiEffects, loggerFactory, bodyClassManager } = dependencies;

    // Store references
    this.registry = uiComponentRegistry;
    this.effects = uiEffects;
    this.bodyClassManager = bodyClassManager;
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
    const bindings = createDomBindings(document);
    this.dom = bindings;
    return bindings.flat;
  }

  /**
   * Initialize UI component instances
   */
  initializeComponents() {
    if (this.registry) {
      this.registry.initialize(this.elements, { bodyClassManager: this.bodyClassManager });
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
      const settingsElements = {
        ...this.dom?.settings,
        ...this.dom?.updates
      };
      this.registry.initializeComponent('settingsMenuComponent', {
        elements: settingsElements,
        dependencies
      });
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
      this.registry.initializeComponent('shaderSelectorComponent', { elements, dependencies });
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
      this.registry.initializeComponent('notesPanelComponent', { elements, dependencies });
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
   * Set record button disabled state
   * @param {boolean} disabled - Whether the button should be disabled
   */
  setRecordButtonDisabled(disabled) {
    const recordBtn = this.elements.recordBtn;
    if (recordBtn) {
      recordBtn.disabled = disabled;
      if (disabled) {
        recordBtn.classList.add('disabled');
      } else {
        recordBtn.classList.remove('disabled');
      }
    }
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
