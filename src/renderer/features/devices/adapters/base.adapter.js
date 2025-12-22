import { IDeviceAdapter } from '@shared/interfaces/device-adapter.interface.js';
import { AcquisitionContext } from '../../streaming/acquisition/acquisition.context.js';

/**
 * Base device adapter with common functionality for media stream acquisition
 * Subclasses should override getStream() for device-specific acquisition logic.
 * @extends IDeviceAdapter
 */
export class BaseDeviceAdapter extends IDeviceAdapter {
  /**
   * @param {Object} [dependencies={}] - Injected dependencies
   * @param {EventBus} [dependencies.eventBus] - Event publisher
   * @param {Object} [dependencies.logger] - Logger instance
   * @param {ConstraintBuilder} [dependencies.constraintBuilder] - Builds media constraints
   * @param {BaseStreamLifecycle} [dependencies.streamLifecycle] - Stream lifecycle manager
   */
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
   * @param {MediaDeviceInfo} deviceInfo - Device information from enumeration
   * @returns {Promise<void>}
   */
  async initialize(deviceInfo) {
    this.deviceInfo = deviceInfo;
    this._log('info', 'Adapter initialized for device:', deviceInfo);
  }

  /**
   * Get media stream from device
   * Subclasses should override for device-specific acquisition.
   * @param {Object} [options={}] - Stream acquisition options
   * @returns {Promise<MediaStream>} Acquired media stream
   * @throws {Error} If adapter not properly initialized
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
   * Release a media stream and stop all tracks
   * @param {MediaStream} stream - Stream to release
   * @returns {Promise<void>}
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
   * Get device capabilities
   * @returns {Object} Capabilities object with hasAudio, hasVideo, supportsFallback
   */
  getCapabilities() {
    return {
      hasAudio: !!this.profile?.audio,
      hasVideo: !!this.profile?.video,
      supportsFallback: false
    };
  }

  /**
   * Get device profile configuration
   * @returns {DeviceProfile|null} Device profile or null
   */
  getProfile() {
    return this.profile;
  }

  /**
   * Cleanup adapter and release current stream
   * @returns {Promise<void>}
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
