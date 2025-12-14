/**
 * Base interface for device adapters
 * All device adapters must implement this interface
 */
export class IDeviceAdapter {
  /**
   * Initialize the adapter with device information
   * @param {Object} _deviceInfo - Device information
   * @returns {Promise<void>}
   */
  async initialize(_deviceInfo) {
    throw new Error('initialize() must be implemented');
  }

  /**
   * Get a media stream from the device
   * @param {Object} _options - Stream options
   * @returns {Promise<MediaStream>}
   */
  async getStream(_options = {}) {
    throw new Error('getStream() must be implemented');
  }

  /**
   * Release the current stream
   * @param {MediaStream} _stream - Stream to release
   * @returns {Promise<void>}
   */
  async releaseStream(_stream) {
    throw new Error('releaseStream() must be implemented');
  }

  /**
   * Get adapter capabilities
   * @returns {Object} Capabilities object
   */
  getCapabilities() {
    throw new Error('getCapabilities() must be implemented');
  }

  /**
   * Get device profile
   * @returns {Object} Device profile
   */
  getProfile() {
    throw new Error('getProfile() must be implemented');
  }

  /**
   * Cleanup adapter resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    throw new Error('cleanup() must be implemented');
  }
}
