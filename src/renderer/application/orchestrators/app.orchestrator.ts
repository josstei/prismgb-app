/**
 * Application Orchestrator
 *
 * THIN coordinator that wires sub-orchestrators together
 * Should be <100 lines - delegates ALL business logic to domain orchestrators
 *
 * Responsibilities:
 * - Initialize and coordinate all sub-orchestrators
 * - Wire high-level cross-orchestrator events
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

export class AppOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'deviceOrchestrator',
    'streamingOrchestrator',
    'streamingAudioOrchestrator',
    'captureOrchestrator',
    'settingsOrchestrator',
    'updateService',
    'uiSetupOrchestrator',
    'performanceOrchestrator',
    'uiController',
    'appState',
    'settingsService',
    'notesService',
    'eventBus',
    'loggerFactory'
  ] as const;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceOrchestrator} dependencies.deviceOrchestrator - Device management
   * @param {StreamingOrchestrator} dependencies.streamingOrchestrator - Stream management
   * @param {StreamingAudioOrchestrator} dependencies.streamingAudioOrchestrator - Audio stream lifecycle
   * @param {CaptureOrchestrator} dependencies.captureOrchestrator - Screenshot/recording
   * @param {SettingsOrchestrator} dependencies.settingsOrchestrator - Settings and display modes
   * @param {UpdateService} dependencies.updateService - Auto-updates
   * @param {UISetupOrchestrator} dependencies.uiSetupOrchestrator - Canvas lifecycle management
   * @param {PerformanceOrchestrator} dependencies.performanceOrchestrator - Performance state + animation + metrics
   * @param {UIController} dependencies.uiController - UI controller
   * @param {AppState} dependencies.appState - Application state
   * @param {SettingsService} dependencies.settingsService - Settings service
   * @param {NotesService} dependencies.notesService - Notes service
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies) {
    super(
      dependencies,
      [...AppOrchestrator.dependencies],
      'AppOrchestrator'
    );
  }

  /**
   * Initialize all sub-orchestrators in order
   * Wires high-level events before initializing to catch early events.
   * @override
   */
  async onInitialize() {
    // Wire high-level events FIRST (before sub-orchestrators emit events)
    this._wireHighLevelEvents();

    // Initialize domain orchestrators
    await this.streamingAudioOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.deviceOrchestrator.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.performanceOrchestrator.initialize();
    await this.settingsOrchestrator.initialize();
    await this.updateService.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  /**
   * Start the application
   * Initializes UI components and sets up event listeners.
   */
  async start() {
    this.logger.info('Starting application orchestrator...');

    // Initialize deferred UI components (settings menu, shader selector, notes panel)
    this.uiController.initializeDeferredComponents({
      settingsService: this.settingsService,
      updateService: this.updateService,
      notesService: this.notesService,
      appState: this.appState,
      eventBus: this.eventBus,
      loggerFactory: this.loggerFactory,
      logger: this.logger
    });

    // Set up overlay click handlers
    this.uiSetupOrchestrator.setupOverlayClickHandlers(this.uiController.elements);

    // Set up UI event listeners
    this._setupUIEventListeners();

    // Note: Preferences are loaded in SettingsOrchestrator.onInitialize()

    this.logger.info('Application orchestrator started');
  }

  /**
   * Set up UI event listeners
   * Uses event-based communication instead of direct orchestrator calls
   * @private
   */
  _setupUIEventListeners() {
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
   * Wire high-level events across orchestrators
   * @private
   */
  _wireHighLevelEvents() {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.STATUS_CHANGED]: (status) => this._handleDeviceStatusChanged(status),
      [EventChannels.DEVICE.ENUMERATION_FAILED]: (data: { reason?: string; error?: string }) => {
        const message = data.reason === 'webcam_access'
          ? 'Camera access denied. Please allow camera permissions.'
          : `Device error: ${data.error}`;
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message, type: 'warning' });
      }
    });
  }

  /**
   * Handle device status changed
   * @private
   */
  _handleDeviceStatusChanged(status) {
    const connected = status.connected;

    this.logger.info('Device ' + (connected ? 'CONNECTED' : 'DISCONNECTED'));

    // Note: App state automatically derives deviceConnected from DeviceService
    // No need to manually update appState.setDeviceConnected() anymore

    // Update UI via events
    if (connected) {
      this.eventBus.publish(EventChannels.UI.DEVICE_STATUS, { status });
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device ready' });
    } else {
      this.eventBus.publish(EventChannels.UI.DEVICE_STATUS, { status });
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: false });
      this.eventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device disconnected', type: 'warning' });
    }
  }

  /**
   * Cleanup all sub-orchestrators
   * Continues cleanup even if individual orchestrators fail.
   * @override
   */
  async onCleanup() {
    this.logger.info('Cleaning up AppOrchestrator...');

    // Cleanup all sub-orchestrators (continue even if one fails)
    const orchestrators = [
      ['uiSetupOrchestrator', this.uiSetupOrchestrator],
      ['performanceOrchestrator', this.performanceOrchestrator],
      ['updateService', this.updateService],
      ['settingsOrchestrator', this.settingsOrchestrator],
      ['streamingAudioOrchestrator', this.streamingAudioOrchestrator],
      ['streamingOrchestrator', this.streamingOrchestrator],
      ['captureOrchestrator', this.captureOrchestrator],
      ['deviceOrchestrator', this.deviceOrchestrator]
    ];

    for (const [name, dependency] of orchestrators) {
      try {
        if (dependency && typeof dependency.cleanup === 'function') {
          await dependency.cleanup();
        } else if (dependency && typeof dependency.dispose === 'function') {
          await dependency.dispose();
        }
        this.logger.debug(`${name} cleaned up`);
      } catch (error) {
        this.logger.error(`Error cleaning up ${name}:`, error);
      }
    }

    this.logger.info('AppOrchestrator cleanup complete');
  }
}
