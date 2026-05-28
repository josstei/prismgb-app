/**
 * Chromatic Device Adapter
 * Domain-based architecture with clean dependencies
 */

import { BaseDeviceAdapter } from '../device-base.adapter';
import { StreamAcquisitionOrchestrator } from '@renderer/infrastructure/streaming/acquisition/acquisition.orchestrator';
import { DeviceAwareFallbackStrategy } from '@renderer/infrastructure/streaming/acquisition/fallback-strategy';
import { AcquisitionContext } from '@renderer/infrastructure/streaming/acquisition/acquisition-context';
import { chromaticConfig as defaultConfig, chromaticHelpers as defaultHelpers, mediaConfig as defaultMediaConfig } from '@prismgb/devices';

interface IpcClientLike {
  getDeviceStatus(): Promise<unknown>;
}

interface ChromaticConfigLike {
  name?: string;
  rendering: { canvasScale: number; recommendedScales?: readonly number[]; [key: string]: unknown };
  display: { nativeWidth: number; nativeHeight: number; pixelPerfect: boolean; resolutions: ReadonlyArray<unknown> };
  media?: ChromaticMediaConfig;
}

interface ChromaticMediaConfig {
  audioFull?: Record<string, unknown>;
  video?: { frameRate?: { ideal?: number }; [key: string]: unknown };
  [key: string]: unknown;
}

interface ChromaticHelpersLike {
  getResolutionByScale(scale: number): { width: number; height: number };
}

interface ChromaticDeviceProfile {
  name: string;
  rendering: Record<string, unknown>;
  media: {
    audio?: { full?: Record<string, unknown>; [key: string]: unknown };
    video?: Record<string, unknown>;
    fallbackStrategy?: string;
    [key: string]: unknown;
  };
  display: Record<string, unknown>;
}

interface BrowserMediaServiceLike {
  enumerateDevices(): Promise<MediaDeviceInfo[]>;
}

type BaseDeviceAdapterDependencyBag = ConstructorParameters<typeof BaseDeviceAdapter>[0];

type ChromaticAdapterDependencies = BaseDeviceAdapterDependencyBag & {
  ipcClient?: IpcClientLike;
  config?: ChromaticConfigLike;
  mediaConfig?: ChromaticMediaConfig;
  helpers?: ChromaticHelpersLike;
  browserMediaService?: BrowserMediaServiceLike | null;
  acquisitionCoordinator?: StreamAcquisitionOrchestrator;
  fallbackStrategy?: DeviceAwareFallbackStrategy;
};

export class DeviceChromaticAdapter extends BaseDeviceAdapter {
  ipcClient: IpcClientLike;
  deviceProfile: ChromaticDeviceProfile | null;
  config: ChromaticConfigLike;
  mediaConfig: ChromaticMediaConfig;
  helpers: ChromaticHelpersLike;
  browserMediaService: BrowserMediaServiceLike | null;
  canvasScale: number;
  acquisitionCoordinator: StreamAcquisitionOrchestrator;

  constructor(dependencies: ChromaticAdapterDependencies) {
    super(dependencies);

    if (!dependencies.ipcClient) {
      throw new Error('DeviceChromaticAdapter: ipcClient is required');
    }

    this.ipcClient = dependencies.ipcClient;
    this.deviceProfile = null;

    // Allow config injection for testing, fall back to defaults
    this.config = (dependencies.config || defaultConfig) as ChromaticConfigLike;
    this.mediaConfig = dependencies.mediaConfig || defaultMediaConfig;
    this.helpers = dependencies.helpers || defaultHelpers;
    this.browserMediaService = dependencies.browserMediaService || null;

    this.canvasScale = this.config.rendering.canvasScale;

    // Use injected coordinator or create with default strategy
    // Note: Coordinator needs adapter-specific constraintBuilder and streamLifecycle
    if (dependencies.acquisitionCoordinator) {
      this.acquisitionCoordinator = dependencies.acquisitionCoordinator;
    } else {
      const fallbackStrategy = dependencies.fallbackStrategy || new DeviceAwareFallbackStrategy();
      this.acquisitionCoordinator = new StreamAcquisitionOrchestrator({
        constraintBuilder: this.constraintBuilder,
        streamLifecycle: this.streamLifecycle,
        logger: this.logger,
        fallbackStrategy
      });
    }

    this._log('info', 'DeviceChromaticAdapter initialized');
  }

  /**
   * Initialize adapter with device info
   */
  async initialize(deviceInfo: MediaDeviceInfo): Promise<void> {
    await super.initialize(deviceInfo);

    // Load device profile from main process
    await this.ensureDeviceProfile();

    // Set profile for constraint building
    this.profile = {
      audio: this.deviceProfile?.media?.audio?.full || this.mediaConfig.audioFull,
      video: this.deviceProfile?.media?.video || this.mediaConfig.video
    };
  }

  async getStream(options: Record<string, unknown> = {}): Promise<MediaStream> {
    const device = options as Partial<MediaDeviceInfo>;
    // Handle initialization if needed
    if (device && device.deviceId && !this.deviceInfo) {
      await this.initialize(device as MediaDeviceInfo);
    }

    if (!this.deviceInfo || !this.deviceInfo.deviceId) {
      throw new Error('DeviceChromaticAdapter: Device not initialized');
    }

    this._log('info', 'Getting stream from Chromatic device:', this.deviceInfo.label);

    // Ensure device profile is loaded
    await this.ensureDeviceProfile();

    // Create immutable acquisition context
    const context = new AcquisitionContext({
      deviceId: this.deviceInfo.deviceId,
      groupId: this.deviceInfo.groupId || null,
      profile: this.profile ?? undefined
    });

    const audioDeviceId = await this._resolveAudioDeviceId();
    const acquisitionOptions = audioDeviceId
      ? { audioDeviceId }
      : { audio: false };

    if (!audioDeviceId) {
      this._log('warn', 'No matching audio input found - disabling audio to avoid mic capture');
    }

    // Acquire stream with device-aware fallback
    const { stream, strategy } = await this.acquisitionCoordinator.acquire(context, acquisitionOptions);

    this.currentStream = stream;
    this._log('info', `Stream acquired using strategy: ${strategy}`);

    // Log stream info using base class method
    const streamInfo = this.streamLifecycle!.getStreamInfo(stream);
    this._log('info', 'Stream info:', streamInfo);

    return stream;
  }

  /**
   * Get device capabilities
   */
  getCapabilities() {
    const base = super.getCapabilities();
    const { nativeWidth, nativeHeight } = this.config.display;

    return {
      ...base,
      canvasScale: this.canvasScale,
      nativeResolution: {
        width: nativeWidth,
        height: nativeHeight
      },
      canvasResolution: this.helpers.getResolutionByScale(this.canvasScale),
      frameRate: this.mediaConfig?.video?.frameRate?.ideal || 60,
      audioSupport: true,
      fallbackStrategy: this.deviceProfile?.media?.fallbackStrategy || 'audio-simple',
      pixelPerfect: this.config.display.pixelPerfect,
      supportedResolutions: this.config.display.resolutions
    };
  }

  /**
   * Ensure device profile is loaded from static config
   */
  async ensureDeviceProfile() {
    if (this.deviceProfile) {
      return;
    }

    // Use static config - profile is defined in chromatic.config.js
    this.deviceProfile = {
      name: this.config.name || defaultConfig.name,
      rendering: this.config.rendering,
      media: this.config.media || this.mediaConfig,
      display: this.config.display
    };
    this._log('info', 'Using unified config for device profile');
  }

  /**
   * Get current canvas scale
   */
  getCanvasScale() {
    return this.canvasScale;
  }

  /**
   * Set canvas scale
   */
  setCanvasScale(scale: number) {
    const { min, max } = this._getScaleBounds();
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < min || scale > max) {
      throw new Error(`DeviceChromaticAdapter.setCanvasScale: Scale must be a number between ${min} and ${max}`);
    }

    this.canvasScale = scale;
    this._log('info', `Canvas scale updated to ${scale}x`);
  }

  /**
   * Get device configuration
   */
  getConfig() {
    return this.config;
  }

  private _getScaleBounds(): { min: number; max: number } {
    const configuredScales = this.config.rendering.recommendedScales?.filter((scale) => Number.isFinite(scale)) || [];
    const scales = configuredScales.length > 0 ? configuredScales : defaultConfig.rendering.recommendedScales;
    return { min: Math.min(...scales), max: Math.max(...scales) };
  }

  async _resolveAudioDeviceId() {
    const groupId = this.deviceInfo?.groupId;
    if (!groupId) {
      this._log('debug', 'No groupId for device - cannot resolve audio input');
      return null;
    }

    const enumerate = this.browserMediaService?.enumerateDevices
      ? this.browserMediaService.enumerateDevices.bind(this.browserMediaService)
      : navigator.mediaDevices?.enumerateDevices?.bind(navigator.mediaDevices);

    if (!enumerate) {
      this._log('warn', 'MediaDevices API unavailable - cannot resolve audio input');
      return null;
    }

    try {
      const devices = await enumerate();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      const match = audioInputs.find(device => device.groupId === groupId);

      if (match?.deviceId) {
        this._log('info', 'Matched audio input for device groupId:', match.label || match.deviceId);
        return match.deviceId;
      }
    } catch (error) {
      this._log('warn', 'Failed to enumerate audio devices:', error);
    }

    return null;
  }
}
