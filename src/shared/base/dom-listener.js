/**
 * DOM Listener Manager
 *
 * Provides tracked DOM event listener management with automatic cleanup.
 * Ensures all event listeners are properly removed to prevent memory leaks.
 *
 * Usage:
 *   // Create manager instance
 *   this._domListeners = createDomListenerManager({ logger: this.logger });
 *
 *   // Add listeners
 *   this._domListeners.add(element, 'click', handler);
 *   this._domListeners.add(document, 'keydown', escHandler);
 *
 *   // Cleanup all
 *   this._domListeners.removeAll();
 */

/**
 * Create a DOM listener manager instance
 * @param {Object} [options] - Configuration options
 * @param {Object} [options.logger] - Logger with warn method
 * @returns {Object} DOM listener manager methods
 */
export function createDomListenerManager(options = {}) {
  const { logger } = options;
  const listeners = [];

  return {
    /**
     * Add a tracked DOM event listener
     * @param {EventTarget} target - DOM element or document
     * @param {string} event - Event name (e.g., 'click', 'keydown')
     * @param {Function} handler - Event handler function
     * @param {Object} [opts] - addEventListener options
     * @returns {Function} Unsubscribe function
     */
    add(target, event, handler, opts) {
      if (!target) {
        logger?.warn(`Cannot add listener: target is null for "${event}"`);
        return () => {};
      }

      target.addEventListener(event, handler, opts);
      const entry = { target, event, handler, opts };
      listeners.push(entry);

      // Return unsubscribe function
      return () => {
        target.removeEventListener(event, handler, opts);
        const idx = listeners.indexOf(entry);
        if (idx > -1) listeners.splice(idx, 1);
      };
    },

    /**
     * Remove all tracked DOM event listeners
     */
    removeAll() {
      for (const { target, event, handler, opts } of listeners) {
        try {
          target.removeEventListener(event, handler, opts);
        } catch (error) {
          logger?.warn(`Error removing "${event}" listener:`, error);
        }
      }
      listeners.length = 0;
    },

    /**
     * Get count of active listeners (for testing/debugging)
     * @returns {number}
     */
    count() {
      return listeners.length;
    }
  };
}
