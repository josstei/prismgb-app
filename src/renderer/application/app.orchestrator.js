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

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

export class AppOrchestrator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceOrchestrator} dependencies.deviceOrchestrator - Device management
   * @param {StreamingOrchestrator} dependencies.streamingOrchestrator - Stream management
   * @param {CaptureOrchestrator} dependencies.captureOrchestrator - Screenshot/recording
   * @param {PreferencesOrchestrator} dependencies.preferencesOrchestrator - User preferences
   * @param {DisplayModeOrchestrator} dependencies.displayModeOrchestrator - Display modes
   * @param {UpdateOrchestrator} dependencies.updateOrchestrator - Auto-updates
   * @param {UISetupOrchestrator} dependencies.uiSetupOrchestrator - UI initialization
   * @param {AnimationPerformanceOrchestrator} dependencies.animationPerformanceOrchestrator - CSS animation controls
   * @param {PerformanceMetricsOrchestrator} dependencies.performanceMetricsOrchestrator - Process metrics logging
   * @param {PerformanceStateOrchestrator} dependencies.performanceStateOrchestrator - Performance state fan-out
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies) {
    super(
      dependencies,
      [
        'deviceOrchestrator',
        'streamingOrchestrator',
        'captureOrchestrator',
        'preferencesOrchestrator',
        'displayModeOrchestrator',
        'updateOrchestrator',
        'uiSetupOrchestrator',
        'animationPerformanceOrchestrator',
        'performanceMetricsOrchestrator',
        'performanceStateOrchestrator',
        'eventBus',
        'loggerFactory'
      ],
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
    await this.deviceOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.performanceStateOrchestrator.initialize();
    await this.animationPerformanceOrchestrator.initialize();
    await this.performanceMetricsOrchestrator.initialize();
    await this.preferencesOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.updateOrchestrator.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  /**
   * Start the application
   * Initializes UI components and sets up event listeners.
   */
  async start() {
    this.logger.info('Starting application orchestrator...');

    // Delegate UI setup to UISetupOrchestrator
    this.uiSetupOrchestrator.initializeSettingsMenu();
    this.uiSetupOrchestrator.initializeShaderSelector();
    this.uiSetupOrchestrator.setupOverlayClickHandlers();
    this.uiSetupOrchestrator.setupUIEventListeners();

    // Note: Preferences are loaded in PreferencesOrchestrator.onInitialize()

    this.logger.info('Application orchestrator started');
  }

  /**
   * Wire high-level events across orchestrators
   * @private
   */
  _wireHighLevelEvents() {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.STATUS_CHANGED]: (status) => this._handleDeviceStatusChanged(status),
      [EventChannels.DEVICE.ENUMERATION_FAILED]: (data) => {
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
      ['animationPerformanceOrchestrator', this.animationPerformanceOrchestrator],
      ['performanceMetricsOrchestrator', this.performanceMetricsOrchestrator],
      ['performanceStateOrchestrator', this.performanceStateOrchestrator],
      ['updateOrchestrator', this.updateOrchestrator],
      ['displayModeOrchestrator', this.displayModeOrchestrator],
      ['preferencesOrchestrator', this.preferencesOrchestrator],
      ['streamingOrchestrator', this.streamingOrchestrator],
      ['captureOrchestrator', this.captureOrchestrator],
      ['deviceOrchestrator', this.deviceOrchestrator]
    ];

    for (const [name, orchestrator] of orchestrators) {
      try {
        await orchestrator.cleanup();
        this.logger.debug(`${name} cleaned up`);
      } catch (error) {
        this.logger.error(`Error cleaning up ${name}:`, error);
      }
    }

    this.logger.info('AppOrchestrator cleanup complete');
  }
}
