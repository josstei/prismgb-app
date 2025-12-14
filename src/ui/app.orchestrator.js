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
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class AppOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      [
        'deviceOrchestrator',
        'streamingOrchestrator',
        'captureOrchestrator',
        'preferencesOrchestrator',
        'displayModeOrchestrator',
        'uiSetupOrchestrator',
        'eventBus',
        'loggerFactory'
      ],
      'AppOrchestrator'
    );
  }

  /**
   * Initialize orchestrator - wire up all sub-orchestrators
   */
  async onInitialize() {
    // Wire high-level events FIRST (before sub-orchestrators emit events)
    this._wireHighLevelEvents();

    // Initialize domain orchestrators
    await this.deviceOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.preferencesOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  /**
   * Start orchestrator - perform initial setup and state loading
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
      // Device disconnected - stop stream if active and show standby
      if (this.streamingOrchestrator.isStreaming) {
        this.logger.warn('Device disconnected while streaming - stopping stream');
        this.streamingOrchestrator.stop();
      }

      // Always ensure overlay is visible when device is disconnected
      this.eventBus.publish(EventChannels.UI.DEVICE_STATUS, { status });
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: false });
      this.eventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device disconnected', type: 'warning' });
    }
  }

  /**
   * Cleanup resources
   * Note: EventBus subscriptions are automatically cleaned up by BaseOrchestrator
   */
  async onCleanup() {
    this.logger.info('Cleaning up AppOrchestrator...');

    // Cleanup all sub-orchestrators (continue even if one fails)
    const orchestrators = [
      ['uiSetupOrchestrator', this.uiSetupOrchestrator],
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
