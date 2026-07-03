import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { DeviceEnumerationFailedPayload, DeviceStatus } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type LifecycleOrchestrator = {
  initialize(): Promise<void> | void;
  cleanup(): Promise<void> | void;
};

type UISetupOrchestratorLike = LifecycleOrchestrator & {
  initializeDeferredComponents(): void;
  setupUIEventListeners(): void;
};

@injectable()
export class AppOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.rendererDeviceRuntime) private readonly rendererDeviceRuntime: LifecycleOrchestrator,
    @inject(TOKENS.streamingOrchestrator) private readonly streamingOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.streamingAudioOrchestrator) private readonly streamingAudioOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.captureOrchestrator) private readonly captureOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.preferencesOrchestrator) private readonly preferencesOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.displayModeOrchestrator) private readonly displayModeOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.updateOrchestrator) private readonly updateOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.uiSetupOrchestrator) private readonly uiSetupOrchestrator: UISetupOrchestratorLike,
    @inject(TOKENS.animationPerformanceOrchestrator) private readonly animationPerformanceOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.performanceMetricsOrchestrator) private readonly performanceMetricsOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.performanceStateOrchestrator) private readonly performanceStateOrchestrator: LifecycleOrchestrator,
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'AppOrchestrator');
  }

  async onInitialize(): Promise<void> {
    // Initialize domain orchestrators
    await this.streamingAudioOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.rendererDeviceRuntime.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.performanceStateOrchestrator.initialize();
    await this.animationPerformanceOrchestrator.initialize();
    await this.performanceMetricsOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.preferencesOrchestrator.initialize();
    await this.updateOrchestrator.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  /**
   * Start the application
   * Initializes UI components and sets up event listeners.
   */
  async start(): Promise<void> {
    this.logger.info('Starting application orchestrator...');

    // Delegate UI setup to UISetupOrchestrator
    this.uiSetupOrchestrator.initializeDeferredComponents();
    this.uiSetupOrchestrator.setupUIEventListeners();

    // Note: Preferences are loaded in PreferencesOrchestrator.onInitialize()

    this.logger.info('Application orchestrator started');
  }

  @OnEvent(EventChannels.DEVICE.ENUMERATION_FAILED)
  private _handleDeviceEnumerationFailed(payload: DeviceEnumerationFailedPayload): void {
    const reason = payload.reason ?? '';
    const error = payload.error ?? 'Unknown error';
    const message = reason === 'webcam_access'
      ? 'Camera access denied. Please allow camera permissions.'
      : `Device error: ${error}`;
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message, type: 'warning' });
  }

  @OnEvent(EventChannels.DEVICE.STATUS_CHANGED)
  _handleDeviceStatusChanged(status: DeviceStatus): void {
    const connected = status.connected;

    this.logger.info('Device ' + (connected ? 'CONNECTED' : 'DISCONNECTED'));

    // AppState derives device connection from RendererDeviceRuntime.
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

  async onCleanup(): Promise<void> {
    this.logger.info('Cleaning up AppOrchestrator...');

    // Cleanup all sub-orchestrators (continue even if one fails)
    const orchestrators: Array<[string, LifecycleOrchestrator]> = [
      ['uiSetupOrchestrator', this.uiSetupOrchestrator],
      ['animationPerformanceOrchestrator', this.animationPerformanceOrchestrator],
      ['performanceMetricsOrchestrator', this.performanceMetricsOrchestrator],
      ['performanceStateOrchestrator', this.performanceStateOrchestrator],
      ['updateOrchestrator', this.updateOrchestrator],
      ['displayModeOrchestrator', this.displayModeOrchestrator],
      ['preferencesOrchestrator', this.preferencesOrchestrator],
      ['streamingAudioOrchestrator', this.streamingAudioOrchestrator],
      ['streamingOrchestrator', this.streamingOrchestrator],
      ['captureOrchestrator', this.captureOrchestrator],
      ['rendererDeviceRuntime', this.rendererDeviceRuntime]
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
