/**
 * Stream Health Monitor
 *
 * Verifies actual video frame delivery using requestVideoFrameCallback.
 * Detects "stream acquired but no frames arriving" when device is powered off.
 *
 * Follows VisibilityHandler pattern: lightweight, focused, callback-based.
 * Uses RVFC (already used in GPU render loop) - zero polling overhead.
 */
export class StreamHealthMonitor {
  constructor(logger) {
    this.logger = logger;
    this._timeoutMs = 4000;
    this._isMonitoring = false;
    this._timeoutHandle = null;
    this._rvfcHandle = null;
    this._firstFrameReceived = false;
    this._onHealthy = null;
    this._onUnhealthy = null;
    this._videoElement = null;

    // Bind methods for event listeners
    this._handleFrameCallback = this._handleFrameCallback.bind(this);
    this._handleTimeUpdate = this._handleTimeUpdate.bind(this);
  }

  /**
   * Start monitoring for frame delivery
   * @param {HTMLVideoElement} videoElement - Video element to monitor
   * @param {Function} onHealthy - Callback when first frame received
   * @param {Function} onUnhealthy - Callback when timeout expires without frames
   * @param {number} timeoutMs - Timeout in milliseconds (default 4000)
   */
  startMonitoring(videoElement, onHealthy, onUnhealthy, timeoutMs = 4000) {
    if (this._isMonitoring) {
      this.stopMonitoring();
    }

    this._videoElement = videoElement;
    this._onHealthy = onHealthy;
    this._onUnhealthy = onUnhealthy;
    this._timeoutMs = timeoutMs;
    this._isMonitoring = true;
    this._firstFrameReceived = false;

    // Start timeout
    this._timeoutHandle = setTimeout(() => this._handleTimeout(), this._timeoutMs);

    // Register for first frame callback
    this._registerFrameCallback();

    this.logger.debug(`Stream health monitoring started (timeout: ${timeoutMs}ms)`);
  }

  /**
   * Register for frame callback using RVFC or fallback
   * @private
   */
  _registerFrameCallback() {
    if (!this._videoElement || !this._isMonitoring) return;

    // Prefer requestVideoFrameCallback (more accurate, synced to video frames)
    if (this._videoElement.requestVideoFrameCallback) {
      this._rvfcHandle = this._videoElement.requestVideoFrameCallback(this._handleFrameCallback);
    } else {
      // Fallback to timeupdate event (fires during playback)
      this._videoElement.addEventListener('timeupdate', this._handleTimeUpdate, { once: true });
    }
  }

  /**
   * Handle RVFC callback - first frame received
   * @param {number} now - Current time
   * @param {Object} metadata - Video frame metadata
   * @private
   */
  _handleFrameCallback(now, metadata) {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this._firstFrameReceived = true;
    this.logger.info('First frame received - stream is healthy');
    this._clearTimeout();

    if (this._onHealthy) {
      this._onHealthy({ frameTime: metadata?.mediaTime ?? now });
    }

    this._cleanup();
  }

  /**
   * Handle timeupdate fallback - indicates playback progress
   * @private
   */
  _handleTimeUpdate() {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this._firstFrameReceived = true;
    this.logger.info('Playback detected via timeupdate - stream is healthy');
    this._clearTimeout();

    if (this._onHealthy) {
      this._onHealthy({ frameTime: Date.now() });
    }

    this._cleanup();
  }

  /**
   * Handle timeout - no frames received
   * @private
   */
  _handleTimeout() {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this.logger.warn(`No frames received in ${this._timeoutMs}ms - device may be powered off`);
    this._cancelRvfc();

    if (this._onUnhealthy) {
      this._onUnhealthy({
        timeoutMs: this._timeoutMs,
        reason: 'NO_FRAMES_RECEIVED'
      });
    }

    this._cleanup();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (!this._isMonitoring) return;

    this.logger.debug('Stream health monitoring stopped');
    this._cleanup();
  }

  /**
   * Check if currently monitoring
   * @returns {boolean}
   */
  isMonitoring() {
    return this._isMonitoring;
  }

  /**
   * Clear the timeout
   * @private
   */
  _clearTimeout() {
    if (this._timeoutHandle !== null) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }
  }

  /**
   * Cancel RVFC and remove event listeners
   * @private
   */
  _cancelRvfc() {
    // Cancel RVFC if active
    if (this._rvfcHandle !== null && this._videoElement?.cancelVideoFrameCallback) {
      this._videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }

    // Remove fallback event listener
    if (this._videoElement) {
      this._videoElement.removeEventListener('timeupdate', this._handleTimeUpdate);
    }
  }

  /**
   * Clean up all resources
   * @private
   */
  _cleanup() {
    this._clearTimeout();
    this._cancelRvfc();
    this._isMonitoring = false;
    this._videoElement = null;
    this._onHealthy = null;
    this._onUnhealthy = null;
  }

  /**
   * Full cleanup (for orchestrator disposal)
   */
  cleanup() {
    this.stopMonitoring();
  }
}
