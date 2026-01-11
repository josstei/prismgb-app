/**
 * Browser Media Adapter - Abstraction for navigator.mediaDevices API
 *
 * Provides a testable interface for media device operations.
 * Allows mocking in tests without polluting the global navigator object.
 * Tracks added listeners for cleanup.
 */
export class BrowserMediaAdapter {
  constructor() {
    // Track added listeners for cleanup: Map<event, Set<handler>>
    this._listeners = new Map();
  }

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

    // Track the listener for cleanup
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
  }

  /**
   * Remove event listener
   * @param {string} event - Event type
   * @param {Function} handler - Event handler
   */
  removeEventListener(event, handler) {
    this._ensureAvailable();
    navigator.mediaDevices.removeEventListener(event, handler);

    // Remove from tracking
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Remove all tracked event listeners
   * Call this during cleanup to prevent listener leaks
   */
  removeAllListeners() {
    if (!this.isAvailable()) return;

    for (const [event, handlers] of this._listeners) {
      for (const handler of handlers) {
        navigator.mediaDevices.removeEventListener(event, handler);
      }
    }
    this._listeners.clear();
  }

  /**
   * Dispose the adapter and cleanup all listeners
   */
  dispose() {
    this.removeAllListeners();
  }
}
