/**
 * Visibility Handler
 *
 * Manages page visibility events to optimize rendering performance.
 * Pauses rendering when page is hidden to reduce CPU/GPU usage.
 *
 * Responsibilities:
 * - Listen for visibility change events
 * - Invoke callbacks when page visibility changes
 * - Manage event listener lifecycle
 */

export class VisibilityHandler {
  constructor(logger) {
    this.logger = logger;

    // Callbacks
    this._onVisible = null;
    this._onHidden = null;

    // Bind handler for cleanup
    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
  }

  /**
   * Initialize visibility handler
   * @param {Function} onVisible - Callback to invoke when page becomes visible
   * @param {Function} onHidden - Callback to invoke when page becomes hidden
   */
  initialize(onVisible, onHidden) {
    this._onVisible = onVisible;
    this._onHidden = onHidden;

    // Add visibility change listener
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    this.logger.debug('VisibilityHandler initialized');
  }

  /**
   * Handle visibility change events
   * @private
   */
  _handleVisibilityChange() {
    if (document.hidden) {
      this.logger.debug('Page hidden');
      if (this._onHidden) {
        this._onHidden();
      }
    } else {
      this.logger.debug('Page visible');
      if (this._onVisible) {
        this._onVisible();
      }
    }
  }

  /**
   * Check if page is currently hidden
   * @returns {boolean} True if page is hidden
   */
  isHidden() {
    return document.hidden;
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    // Remove visibility change listener
    document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    this.logger.debug('VisibilityHandler cleaned up');

    // Clear callbacks
    this._onVisible = null;
    this._onHidden = null;
  }
}
