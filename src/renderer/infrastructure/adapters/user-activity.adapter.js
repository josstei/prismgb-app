/**
 * User Activity Adapter
 *
 * Wraps DOM user activity events (pointermove, keydown, wheel, touchstart)
 * to make PerformanceStateService testable without DOM dependencies.
 */

const DEFAULT_ACTIVITY_EVENTS = ['pointermove', 'keydown', 'wheel', 'touchstart'];

export class UserActivityAdapter {
  constructor() {
    this._handleUserActivity = null;
    this._activityEvents = DEFAULT_ACTIVITY_EVENTS;
  }

  /**
   * Subscribe to user activity events
   * @param {Function} callback - Called when user activity is detected
   * @returns {Function} Cleanup function to remove listeners
   */
  onActivity(callback) {
    if (typeof document === 'undefined') {
      return () => {};
    }

    this._handleUserActivity = () => {
      callback();
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
  }
}
