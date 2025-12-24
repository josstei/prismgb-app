/**
 * Visibility Adapter
 *
 * Wraps the Page Visibility API (document.hidden, visibilitychange event)
 * to make PerformanceStateService testable without DOM dependencies.
 */

export class VisibilityAdapter {
  constructor() {
    this._handleVisibilityChange = null;
  }

  /**
   * Check if the document is currently hidden
   * @returns {boolean} True if document is hidden
   */
  isHidden() {
    return typeof document !== 'undefined' ? Boolean(document.hidden) : false;
  }

  /**
   * Subscribe to visibility changes
   * @param {Function} callback - Called when visibility changes
   * @returns {Function} Cleanup function to remove listener
   */
  onVisibilityChange(callback) {
    if (typeof document === 'undefined') {
      return () => {};
    }

    this._handleVisibilityChange = () => {
      callback(this.isHidden());
    };

    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    return () => this.dispose();
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    if (this._handleVisibilityChange && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
      this._handleVisibilityChange = null;
    }
  }
}
