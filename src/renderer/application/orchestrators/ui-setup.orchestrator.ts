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

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@shared/events/event-channels.js';

export class UISetupOrchestrator extends BaseOrchestrator {

  constructor(dependencies) {
    super(
      dependencies,
      ['appState', 'updateOrchestrator', 'settingsService', 'notesService', 'uiController', 'eventBus', 'loggerFactory'],
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
      [EventChannels.RENDER.CANVAS_RECREATED]: (data: { oldCanvas: HTMLCanvasElement; newCanvas: HTMLCanvasElement }) => this._handleCanvasRecreated(data)
    });
  }

  /**
   * Handle canvas recreation event
   * Removes listeners from old canvas and adds them to new canvas
   * @param {Object} data - Event data with oldCanvas and newCanvas
   * @private
   */
  _handleCanvasRecreated({ oldCanvas, newCanvas }: { oldCanvas: HTMLCanvasElement; newCanvas: HTMLCanvasElement }) {
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
    const elements = this.uiController.dom?.streaming;
    this.uiController.initShaderSelector(
      {
        settingsService: this.settingsService,
        appState: this.appState,
        eventBus: this.eventBus,
        logger: this.logger
      },
      {
        shaderBtn: elements?.shaderBtn,
        shaderDropdown: elements?.shaderDropdown,
        shaderOptions: elements?.shaderOptions,
        shaderUnavailableMessage: elements?.shaderUnavailableMessage,
        cinematicToggle: elements?.cinematicToggle,
        cinematicPillText: elements?.cinematicPillText,
        streamToolbar: elements?.streamToolbar,
        brightnessSlider: elements?.brightnessSlider,
        brightnessPercentage: elements?.brightnessPercentage,
        brightnessControl: elements?.brightnessControl,
        volumeSlider: elements?.volumeSliderVertical,
        volumePercentage: elements?.volumePercentageVertical,
        streamVideo: elements?.streamVideo
      }
    );
  }

  /**
   * Initialize notes panel component
   */
  initializeNotesPanel() {
    const notesElements = {
      ...this.uiController.dom?.notes,
      streamContainer: this.uiController.dom?.streaming?.streamContainer,
      streamToolbar: this.uiController.dom?.streaming?.streamToolbar
    };
    this.uiController.initNotesPanel(
      {
        notesService: this.notesService,
        eventBus: this.eventBus,
        logger: this.logger
      },
      notesElements
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
      ['fullscreenBtn', 'click', (e) => this._handleFullscreenClick(e)],
      ['settingsBtn', 'click', (e) => this._toggleSettingsMenu(e)],
      ['shaderBtn', 'click', (e) => this._toggleShaderSelector(e)]
    ].forEach(([element, event, handler]) => this.uiController.on(element, event, handler));

    // Clear tooltip on mousedown to prevent it persisting through fullscreen transition
    [
      ['fullscreenBtn', 'mousedown', (e) => { e.currentTarget.title = ''; }],
      ['fsExitBtn', 'mousedown', (e) => { e.currentTarget.title = ''; }]
    ].forEach(([element, event, handler]) => this.uiController.on(element, event, handler));

    // Fullscreen controls
    [
      ['fsExitBtn', 'click', (e) => this._handleFullscreenClick(e)]
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
   * Handle fullscreen button click
   * @param {Event} e - Click event
   * @private
   */
  _handleFullscreenClick(e) {
    e.currentTarget.blur();
    this.eventBus.publish(EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED);
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
