/**
 * User Activity Adapter
 *
 * Wraps DOM user activity events (pointermove, keydown, wheel, touchstart)
 * to make PerformanceStateService testable without DOM dependencies.
 */

const DEFAULT_ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart'];
const THROTTLE_INTERVAL_MS = 100;

export class UserActivityAdapter {
  constructor() {
    this._handleUserActivity = null;
    this._activityEvents = DEFAULT_ACTIVITY_EVENTS;
    this._lastActivityTime = 0;
  }

  /**
   * Subscribe to user activity events
   * Throttled to prevent excessive callback invocations from high-frequency events
   * @param {Function} callback - Called when user activity is detected
   * @returns {Function} Cleanup function to remove listeners
   */
  onActivity(callback) {
    if (typeof document === 'undefined') {
      return () => {};
    }

    // Throttled handler to prevent excessive callback invocations
    this._handleUserActivity = () => {
      const now = Date.now();
      if (now - this._lastActivityTime >= THROTTLE_INTERVAL_MS) {
        this._lastActivityTime = now;
        callback();
      }
    };

    this._activityEvents.forEach((event) => {
      document.addEventListener(event, this._handleUserActivity, { passive: true });
    });

    return () => this.dispose();
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    if (this._handleUserActivity && typeof document !== 'undefined') {
      this._activityEvents.forEach((event) => {
        document.removeEventListener(event, this._handleUserActivity, { passive: true });
      });
      this._handleUserActivity = null;
    }
    this._lastActivityTime = 0;
  }
}
