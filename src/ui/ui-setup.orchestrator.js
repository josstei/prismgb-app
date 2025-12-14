/**
 * UI Setup Orchestrator
 *
 * Coordinates UI initialization and event listener setup
 *
 * Responsibilities:
 * - Initialize settings menu
 * - Set up UI event listeners
 * - Set up overlay click handlers
 * - Toggle settings menu
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { createDomListenerManager } from '@shared/base/dom-listener.js';
import { CSSClasses } from '@shared/config/css-classes.js';

export class UISetupOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['appState', 'streamingOrchestrator', 'captureOrchestrator', 'displayModeOrchestrator', 'settingsService', 'uiController', 'eventBus', 'loggerFactory'],
      'UISetupOrchestrator'
    );

    // DOM listener manager for cleanup (separate from EventBus subscriptions)
    this._domListeners = createDomListenerManager({ logger: this.logger });
  }

  /**
   * Initialize settings menu component
   */
  initializeSettingsMenu() {
    this.uiController.initSettingsMenu({
      settingsService: this.settingsService,
      eventBus: this.eventBus,
      logger: this.logger
    });
  }

  /**
   * Initialize shader selector component
   */
  initializeShaderSelector() {
    const elements = this.uiController.elements;
    this.uiController.initShaderSelector(
      {
        settingsService: this.settingsService,
        logger: this.logger
      },
      {
        shaderBtn: elements.shaderBtn,
        shaderDropdown: elements.shaderDropdown,
        cinematicToggle: elements.cinematicToggle,
        streamToolbar: elements.streamToolbar
      }
    );
  }

  /**
   * Set up UI event listeners
   */
  setupUIEventListeners() {
    [
      ['screenshotBtn', 'click', () => this.captureOrchestrator.takeScreenshot()],
      ['recordBtn', 'click', () => this.captureOrchestrator.toggleRecording()],
      ['fullscreenBtn', 'click', () => this.displayModeOrchestrator.toggleFullscreen()],
      ['volumeBtn', 'click', (e) => this.displayModeOrchestrator.toggleVolumeSlider(e)],
      ['volumeSlider', 'input', () => this.displayModeOrchestrator.handleVolumeSliderChange()],
      ['settingsBtn', 'click', (e) => this._toggleSettingsMenu(e)],
      ['shaderBtn', 'click', (e) => this._toggleShaderSelector(e)]
    ].forEach(([element, event, handler]) => this.uiController.on(element, event, handler));

    this.logger.info('UI event listeners set up');
  }

  /**
   * Set up click handlers for overlay and video elements
   */
  setupOverlayClickHandlers() {
    const { streamOverlay, streamVideo, streamCanvas } = this.uiController.elements;

    this._domListeners.add(streamOverlay, 'click', () => {
      if (streamOverlay.classList.contains(CSSClasses.HIDDEN)) {
        return;
      }
      this.logger.info('Overlay clicked - starting stream');
      this.streamingOrchestrator.start();
    });

    const stopStream = () => {
      if (!this.appState.isStreaming) {
        return;
      }
      this.logger.info('Stream clicked - stopping stream');
      this.streamingOrchestrator.stop();
    };

    this._domListeners.add(streamVideo, 'click', stopStream);
    this._domListeners.add(streamCanvas, 'click', stopStream);

    this.logger.info('Overlay click handlers initialized');
  }

  /**
   * Toggle settings menu
   * @param {Event} e - Click event
   * @private
   */
  _toggleSettingsMenu(e) {
    e.stopPropagation();
    this.uiController.toggleSettingsMenu();
  }

  /**
   * Toggle shader selector
   * @param {Event} e - Click event
   * @private
   */
  _toggleShaderSelector(e) {
    e.stopPropagation();
    this.uiController.toggleShaderSelector();
  }

  /**
   * Cleanup resources
   */
  async onCleanup() {
    this.logger.info('Cleaning up UISetupOrchestrator...');
    this._domListeners.removeAll();
    this.logger.info('UISetupOrchestrator cleanup complete');
  }
}
