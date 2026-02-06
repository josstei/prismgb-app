/**
 * HideTimer - Shared timer utility for coordinated hiding behavior
 *
 * Used by cursor and toolbar auto-hide to synchronize their hiding.
 * Supports conditions that prevent the timer from starting.
 */

import { TIMING } from '@renderer/presentation/config/constants.config.ts';

export class HideTimer {
  /**
   * @param {Object} options
   * @param {Function} options.onTimeout - Callback when timer expires
   * @param {Function} [options.shouldStart] - Predicate to check if timer should start
   * @param {number} [options.delay] - Delay in ms (defaults to CURSOR_HIDE_DELAY_MS)
   */
  constructor(options = {}) {
    this._timer = null;
    this._onTimeout = options.onTimeout || (() => {});
    this._shouldStart = options.shouldStart || (() => true);
    this._delay = options.delay ?? TIMING.CURSOR_HIDE_DELAY_MS;
  }

  /**
   * Start or reset the timer
   * Only starts if shouldStart() returns true
   */
  start() {
    this.clear();

    if (!this._shouldStart()) {
      return;
    }

    this._timer = setTimeout(() => {
      this._onTimeout();
    }, this._delay);
  }

  /**
   * Clear the timer
   */
  clear() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Check if timer is currently running
   * @returns {boolean}
   */
  get isRunning() {
    return this._timer !== null;
  }

  /**
   * Dispose and cleanup
   */
  dispose() {
    this.clear();
  }
}
