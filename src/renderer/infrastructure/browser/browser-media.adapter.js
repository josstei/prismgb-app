/**
 * Browser Media Adapter - Abstraction for navigator.mediaDevices API
 *
 * Provides a testable interface for media device operations.
 * Allows mocking in tests without polluting the global navigator object.
 */
export class BrowserMediaAdapter {
  /**
   * Check if MediaDevices API is available
   * @returns {boolean} True if API is available
   */
  isAvailable() {
    return typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined;
  }

  /**
   * Throw if MediaDevices API is not available
   * @private
   */
  _ensureAvailable() {
    if (!this.isAvailable()) {
      throw new Error('MediaDevices API not available');
    }
  }

  /**
   * Enumerate available media devices
   * @returns {Promise<MediaDeviceInfo[]>} List of media devices
   */
  async enumerateDevices() {
    this._ensureAvailable();
    return navigator.mediaDevices.enumerateDevices();
  }

  /**
   * Get user media stream
   * @param {MediaStreamConstraints} constraints - Media constraints
   * @returns {Promise<MediaStream>} Media stream
   */
  async getUserMedia(constraints) {
    this._ensureAvailable();
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Add event listener for device changes
   * @param {string} event - Event type (e.g., 'devicechange')
   * @param {Function} handler - Event handler
   */
  addEventListener(event, handler) {
    this._ensureAvailable();
    navigator.mediaDevices.addEventListener(event, handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  removeEventListener(event, handler) {
    this._ensureAvailable();
    navigator.mediaDevices.removeEventListener(event, handler);
  }
}
