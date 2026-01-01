/**
 * Chromatic Device Adapter
 * Domain-based architecture with clean dependencies
 */

import { BaseDeviceAdapter } from '../base.adapter.js';
import { StreamAcquisitionCoordinator } from '@shared/streaming/acquisition/acquisition.class.js';
import { DeviceAwareFallbackStrategy } from '@shared/streaming/acquisition/fallback-strategy.class.js';
import { AcquisitionContext } from '@shared/streaming/acquisition/acquisition-context.class.js';
import { chromaticConfig as defaultConfig, chromaticHelpers as defaultHelpers, mediaConfig as defaultMediaConfig } from '@shared/features/devices/profiles/chromatic/chromatic.config.js';

export class ChromaticAdapter extends BaseDeviceAdapter {
  /**
   * Create Chromatic adapter
   * @param {Object} dependencies - Injected dependencies
   */
  constructor(dependencies) {
    super(dependencies);

    if (!dependencies.ipcClient) {
      throw new Error('ChromaticAdapter: ipcClient is required');
    }

    this.ipcClient = dependencies.ipcClient;
    this.deviceProfile = null;

    // Allow config injection for testing, fall back to defaults
    this.config = dependencies.config || defaultConfig;
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
      this.acquisitionCoordinator = new StreamAcquisitionCoordinator({
        constraintBuilder: this.constraintBuilder,
        streamLifecycle: this.streamLifecycle,
        logger: this.logger,
        fallbackStrategy
      });
    }

    this._log('info', 'ChromaticAdapter initialized');
  }

  /**
   * Initialize adapter with device info
   */
  async initialize(deviceInfo) {
    await super.initialize(deviceInfo);

    // Load device profile from main process
    await this.ensureDeviceProfile();

    // Set profile for constraint building
    this.profile = {
      audio: this.deviceProfile?.media?.audio?.full || this.mediaConfig.audioFull,
      video: this.deviceProfile?.media?.video || this.mediaConfig.video
    };
  }

  /**
   * Get media stream from Chromatic device
   * @param {Object} device - Device info
   */
  async getStream(device) {
    // Handle initialization if needed
    if (device && device.deviceId && !this.deviceInfo) {
      await this.initialize(device);
    }

    if (!this.deviceInfo || !this.deviceInfo.deviceId) {
      throw new Error('ChromaticAdapter: Device not initialized');
    }

    this._log('info', 'Getting stream from Chromatic device:', this.deviceInfo.label);

    // Ensure device profile is loaded
    await this.ensureDeviceProfile();

    // Create immutable acquisition context
    const context = new AcquisitionContext({
      deviceId: this.deviceInfo.deviceId,
      groupId: this.deviceInfo.groupId || null,
      profile: this.profile
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
    const streamInfo = this.streamLifecycle.getStreamInfo(stream);
    this._log('info', 'Stream info:', streamInfo);

    return stream;
  }

  /**
   * Get device capabilities
   */
  async getCapabilities() {
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
      name: 'Chromatic',
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
  setCanvasScale(scale) {
    if (typeof scale !== 'number' || scale < 1 || scale > 8) {
      throw new Error('ChromaticAdapter.setCanvasScale: Scale must be a number between 1 and 8');
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
