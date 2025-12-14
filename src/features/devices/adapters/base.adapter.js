import { IDeviceAdapter } from '@shared/interfaces/device-adapter.interface.js';
import { AcquisitionContext } from '../../streaming/acquisition/acquisition.context.js';

/**
 * Base device adapter with common functionality
 */
export class BaseDeviceAdapter extends IDeviceAdapter {
  constructor(dependencies = {}) {
    super();

    this.eventBus = dependencies.eventBus;
    this.logger = dependencies.logger;
    this.constraintBuilder = dependencies.constraintBuilder;
    this.streamLifecycle = dependencies.streamLifecycle;

    this.deviceInfo = null;
    this.profile = null;
    this.currentStream = null;
  }

  /**
   * Initialize adapter with device info
   */
  async initialize(deviceInfo) {
    this.deviceInfo = deviceInfo;
    this._log('info', 'Adapter initialized for device:', deviceInfo);
  }

  /**
   * Get stream from device (base implementation)
   * Subclasses should override this for device-specific acquisition
   */
  async getStream(options = {}) {
    if (!this.profile) {
      throw new Error('Adapter not properly initialized - missing profile');
    }

    if (!this.deviceInfo?.deviceId) {
      throw new Error('Adapter not properly initialized - missing deviceInfo');
    }

    // Create acquisition context with device identity
    const context = new AcquisitionContext({
      deviceId: this.deviceInfo.deviceId,
      groupId: this.deviceInfo.groupId || null,
      profile: this.profile
    });

    const constraints = this.constraintBuilder.build(context, 'full', options);
    this.currentStream = await this.streamLifecycle.acquireStream(constraints, options);

    return this.currentStream;
  }

  /**
   * Release stream
   */
  async releaseStream(stream) {
    if (stream) {
      await this.streamLifecycle.releaseStream(stream);
    }
    if (stream === this.currentStream) {
      this.currentStream = null;
    }
  }

  /**
   * Get capabilities
   */
  getCapabilities() {
    return {
      hasAudio: !!this.profile?.audio,
      hasVideo: !!this.profile?.video,
      supportsFallback: false
    };
  }

  /**
   * Get profile
   */
  getProfile() {
    return this.profile;
  }

  /**
   * Cleanup
   */
  async cleanup() {
    if (this.currentStream) {
      await this.releaseStream(this.currentStream);
    }
    this.deviceInfo = null;
    this.profile = null;
  }

  _log(level, message, ...args) {
    if (this.logger && this.logger[level]) {
      this.logger[level](message, ...args);
    }
  }
}
