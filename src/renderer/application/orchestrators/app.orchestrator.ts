import { injectable, inject } from 'inversify';
import { BaseOrchestrator, type LoggerFactory } from '@platform/core';
import type { DeviceStatus } from '@platform/devices';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { OnEvent, type EventBus } from '@renderer/lib/events/event-bus';
import type { DeviceEnumerationFailedPayload } from '@renderer/lib/events/event-payloads';
import { TOKENS } from '@renderer/application/di/tokens';
import type { RendererDeviceRuntime } from '@renderer/infrastructure/services/devices/device-runtime.service';
import type { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import type { UpdateService } from '@renderer/infrastructure/services/updates/update.service';
import type { UpdateUiService } from '@renderer/infrastructure/services/updates/update-ui.service';
import type { StreamingOrchestrator } from './streaming.orchestrator';
import type { StreamingAudioOrchestrator } from './streaming-audio.orchestrator';
import type { CaptureOrchestrator } from './capture.orchestrator';
import type { SettingsDisplayModeOrchestrator } from './display-mode.orchestrator';
import type { UISetupOrchestrator } from './ui-setup.orchestrator';
import type { PerformanceAnimationOrchestrator } from './performance/performance-animation.orchestrator';
import type { PerformanceMetricsOrchestrator } from './performance/performance-metrics.orchestrator';
import type { PerformanceStateOrchestrator } from './performance/performance-state.orchestrator';

@injectable()
export class AppOrchestrator extends BaseOrchestrator {
  constructor(
    @inject(TOKENS.rendererDeviceRuntime) private readonly rendererDeviceRuntime: RendererDeviceRuntime,
    @inject(TOKENS.streamingOrchestrator) private readonly streamingOrchestrator: StreamingOrchestrator,
    @inject(TOKENS.streamingAudioOrchestrator) private readonly streamingAudioOrchestrator: StreamingAudioOrchestrator,
    @inject(TOKENS.captureOrchestrator) private readonly captureOrchestrator: CaptureOrchestrator,
    @inject(TOKENS.displayModeOrchestrator) private readonly displayModeOrchestrator: SettingsDisplayModeOrchestrator,
    @inject(TOKENS.settingsService) private readonly settingsService: SettingsService,
    @inject(TOKENS.updateService) private readonly updateService: UpdateService,
    @inject(TOKENS.updateUiService) private readonly updateUiService: UpdateUiService,
    @inject(TOKENS.uiSetupOrchestrator) private readonly uiSetupOrchestrator: UISetupOrchestrator,
    @inject(TOKENS.animationPerformanceOrchestrator) private readonly animationPerformanceOrchestrator: PerformanceAnimationOrchestrator,
    @inject(TOKENS.performanceMetricsOrchestrator) private readonly performanceMetricsOrchestrator: PerformanceMetricsOrchestrator,
    @inject(TOKENS.performanceStateOrchestrator) private readonly performanceStateOrchestrator: PerformanceStateOrchestrator,
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'AppOrchestrator', eventBus);
  }

  async onInitialize(): Promise<void> {
    await this.streamingAudioOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.rendererDeviceRuntime.initialize();
    await this.captureOrchestrator.initialize();
    await this.performanceStateOrchestrator.initialize();
    await this.animationPerformanceOrchestrator.initialize();
    await this.performanceMetricsOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.settingsService.initialize();
    await this.updateService.initialize();
    this.updateUiService.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  async start(): Promise<void> {
    this.logger.info('Starting application orchestrator...');

    this.uiSetupOrchestrator.initializeDeferredComponents();
    this.uiSetupOrchestrator.setupUIEventListeners();

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

    if (connected) {
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device ready' });
    } else {
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: false });
      this.eventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device disconnected', type: 'warning' });
    }
  }

  async onCleanup(): Promise<void> {
    this.logger.info('Cleaning up AppOrchestrator...');

    // Cleanup all sub-orchestrators (continue even if one fails)
    const orchestrators: Array<[string, Pick<BaseOrchestrator, 'cleanup'>]> = [
      ['uiSetupOrchestrator', this.uiSetupOrchestrator],
      ['animationPerformanceOrchestrator', this.animationPerformanceOrchestrator],
      ['performanceMetricsOrchestrator', this.performanceMetricsOrchestrator],
      ['performanceStateOrchestrator', this.performanceStateOrchestrator],
      ['displayModeOrchestrator', this.displayModeOrchestrator],
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
