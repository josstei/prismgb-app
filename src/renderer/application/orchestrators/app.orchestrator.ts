
import { BaseOrchestrator, disposeInOrder } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { DeviceEnumerationFailedPayload, DeviceStatus } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

type LifecycleOrchestrator = {
  initialize(): Promise<void> | void;
  cleanup(): Promise<void> | void;
};

type UISetupOrchestratorLike = LifecycleOrchestrator & {
  initializeDeferredComponents(): void;
  setupUIEventListeners(): void;
};

type SettingsServiceLike = {
  initialize(): Promise<void> | void;
};

type UpdateServiceLike = {
  initialize(): void | Promise<void>;
};

type UpdateUiServiceLike = {
  initialize(): void;
};

type AppOrchestratorDependencies = {
  rendererDeviceRuntime: LifecycleOrchestrator;
  streamingOrchestrator: LifecycleOrchestrator;
  streamingAudioOrchestrator: LifecycleOrchestrator;
  captureOrchestrator: LifecycleOrchestrator;
  displayModeOrchestrator: LifecycleOrchestrator;
  settingsService: SettingsServiceLike;
  updateService: UpdateServiceLike;
  updateUiService: UpdateUiServiceLike;
  uiSetupOrchestrator: UISetupOrchestratorLike;
  performanceMetricsOrchestrator: LifecycleOrchestrator;
  performanceStateOrchestrator: LifecycleOrchestrator;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class AppOrchestrator extends BaseOrchestrator {
  protected readonly eventBus: EventBusLike;
  private readonly rendererDeviceRuntime: LifecycleOrchestrator;
  private readonly streamingOrchestrator: LifecycleOrchestrator;
  private readonly streamingAudioOrchestrator: LifecycleOrchestrator;
  private readonly captureOrchestrator: LifecycleOrchestrator;
  private readonly displayModeOrchestrator: LifecycleOrchestrator;
  private readonly settingsService: SettingsServiceLike;
  private readonly updateService: UpdateServiceLike;
  private readonly updateUiService: UpdateUiServiceLike;
  private readonly uiSetupOrchestrator: UISetupOrchestratorLike;
  private readonly performanceMetricsOrchestrator: LifecycleOrchestrator;
  private readonly performanceStateOrchestrator: LifecycleOrchestrator;

  constructor({ rendererDeviceRuntime, streamingOrchestrator, streamingAudioOrchestrator, captureOrchestrator, displayModeOrchestrator, settingsService, updateService, updateUiService, uiSetupOrchestrator, performanceMetricsOrchestrator, performanceStateOrchestrator, eventBus, loggerFactory }: AppOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'AppOrchestrator');
    this.eventBus = eventBus;
    this.rendererDeviceRuntime = rendererDeviceRuntime;
    this.streamingOrchestrator = streamingOrchestrator;
    this.streamingAudioOrchestrator = streamingAudioOrchestrator;
    this.captureOrchestrator = captureOrchestrator;
    this.displayModeOrchestrator = displayModeOrchestrator;
    this.settingsService = settingsService;
    this.updateService = updateService;
    this.updateUiService = updateUiService;
    this.uiSetupOrchestrator = uiSetupOrchestrator;
    this.performanceMetricsOrchestrator = performanceMetricsOrchestrator;
    this.performanceStateOrchestrator = performanceStateOrchestrator;
  }

  async onInitialize(): Promise<void> {
    // Initialize domain orchestrators
    await this.streamingAudioOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.rendererDeviceRuntime.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.performanceStateOrchestrator.initialize();
    await this.performanceMetricsOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.settingsService.initialize();
    await this.updateService.initialize();
    this.updateUiService.initialize();
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

    // Note: Preferences are loaded (and SETTINGS.PREFERENCES_LOADED published) by SettingsService.initialize()

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
      ['performanceMetricsOrchestrator', this.performanceMetricsOrchestrator],
      ['performanceStateOrchestrator', this.performanceStateOrchestrator],
      ['displayModeOrchestrator', this.displayModeOrchestrator],
      ['captureOrchestrator', this.captureOrchestrator],
      ['streamingOrchestrator', this.streamingOrchestrator],
      ['streamingAudioOrchestrator', this.streamingAudioOrchestrator],
      ['rendererDeviceRuntime', this.rendererDeviceRuntime]
    ];

    await disposeInOrder(orchestrators.map(([name, orchestrator]) => async () => {
      await orchestrator.cleanup();
      this.logger.debug(`${name} cleaned up`);
    }));

    this.logger.info('AppOrchestrator cleanup complete');
  }
}
