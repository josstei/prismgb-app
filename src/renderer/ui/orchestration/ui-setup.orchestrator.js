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
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

export class UISetupOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['appState', 'displayModeOrchestrator', 'updateOrchestrator', 'settingsService', 'uiController', 'eventBus', 'loggerFactory'],
      'UISetupOrchestrator'
    );

    // DOM listener manager for cleanup (separate from EventBus subscriptions)
    this._domListeners = createDomListenerManager({ logger: this.logger });

    // Store stopStream handler so it can be reused during canvas recreation
    this._stopStreamHandler = null;
  }

  /**
   * Initialize orchestrator - subscribe to canvas recreation events
   */
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_RECREATED]: (data) => this._handleCanvasRecreated(data)
    });
  }

  /**
   * Handle canvas recreation event
   * Removes listeners from old canvas and adds them to new canvas
   * @param {Object} data - Event data with oldCanvas and newCanvas
   * @private
   */
  _handleCanvasRecreated({ oldCanvas, newCanvas }) {
    // Remove listeners from old canvas to allow GC
    const removed = this._domListeners.removeByTarget(oldCanvas);
    this.logger.debug(`Removed ${removed} listener(s) from old canvas`);

    // Add click handler to new canvas
    if (this._stopStreamHandler) {
      this._domListeners.add(newCanvas, 'click', this._stopStreamHandler);
      this.logger.debug('Rebound click handler to new canvas');
    }
  }

  /**
   * Initialize settings menu component
   */
  initializeSettingsMenu() {
    this.uiController.initSettingsMenu({
      settingsService: this.settingsService,
      updateOrchestrator: this.updateOrchestrator,
      eventBus: this.eventBus,
      loggerFactory: this.loggerFactory,
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
        appState: this.appState,
        eventBus: this.eventBus,
        logger: this.logger,
        displayModeOrchestrator: this.displayModeOrchestrator
      },
      {
        shaderBtn: elements.shaderBtn,
        shaderDropdown: elements.shaderDropdown,
        cinematicToggle: elements.cinematicToggle,
        streamToolbar: elements.streamToolbar,
        brightnessSlider: elements.brightnessSlider,
        brightnessPercentage: elements.brightnessPercentage,
        volumeSlider: elements.volumeSliderVertical,
        volumePercentage: elements.volumePercentageVertical,
        streamVideo: elements.streamVideo
      }
    );
  }

  /**
   * Set up UI event listeners
   * Uses event-based communication instead of direct orchestrator calls
   */
  setupUIEventListeners() {
    // Header controls - publish events instead of direct orchestrator calls
    [
      ['screenshotBtn', 'click', () => this.eventBus.publish(EventChannels.UI.SCREENSHOT_REQUESTED)],
      ['recordBtn', 'click', () => this.eventBus.publish(EventChannels.UI.RECORDING_TOGGLE_REQUESTED)],
      ['fullscreenBtn', 'click', () => this.eventBus.publish(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED)],
      ['settingsBtn', 'click', (e) => this._toggleSettingsMenu(e)],
      ['shaderBtn', 'click', (e) => this._toggleShaderSelector(e)]
    ].forEach(([element, event, handler]) => this.uiController.on(element, event, handler));

    // Fullscreen controls
    [
      ['fsExitBtn', 'click', () => this.eventBus.publish(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED)]
    ].forEach(([element, event, handler]) => this.uiController.on(element, event, handler));

    this.logger.info('UI event listeners set up');
  }

  /**
   * Set up click handlers for overlay and video elements
   * Uses event-based communication instead of direct orchestrator calls
   */
  setupOverlayClickHandlers() {
    const { streamOverlay, streamVideo, streamCanvas } = this.uiController.elements;

    this._domListeners.add(streamOverlay, 'click', () => {
      if (streamOverlay.classList.contains(CSSClasses.HIDDEN)) {
        return;
      }
      this.logger.info('Overlay clicked - requesting stream start');
      this.eventBus.publish(EventChannels.UI.STREAM_START_REQUESTED);
    });

    // Store handler so it can be reused during canvas recreation
    this._stopStreamHandler = () => {
      if (!this.appState.isStreaming) {
        return;
      }
      this.logger.info('Stream clicked - requesting stream stop');
      this.eventBus.publish(EventChannels.UI.STREAM_STOP_REQUESTED);
    };

    this._domListeners.add(streamVideo, 'click', this._stopStreamHandler);
    this._domListeners.add(streamCanvas, 'click', this._stopStreamHandler);

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
