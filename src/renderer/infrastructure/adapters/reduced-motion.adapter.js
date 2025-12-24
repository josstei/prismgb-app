/**
 * Reduced Motion Adapter
 *
 * Wraps the prefers-reduced-motion media query API
 * to make PerformanceStateService testable without DOM dependencies.
 */

export class ReducedMotionAdapter {
  constructor() {
    this._mediaQuery = null;
    this._cleanupFn = null;
  }

  /**
   * Check if user prefers reduced motion
   * @returns {boolean} True if user prefers reduced motion
   */
  prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return Boolean(mediaQuery.matches);
  }

  /**
   * Subscribe to changes in reduced motion preference
   * @param {Function} callback - Called when preference changes with boolean value
   * @returns {Function} Cleanup function to remove listener
   */
  onChange(callback) {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return () => {};
    }

    this._mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    const handleChange = (event) => {
      callback(Boolean(event.matches));
    };

    // Support both modern addEventListener and legacy addListener
    if (typeof this._mediaQuery.addEventListener === 'function') {
      this._mediaQuery.addEventListener('change', handleChange);
      this._cleanupFn = () => this._mediaQuery.removeEventListener('change', handleChange);
    } else if (typeof this._mediaQuery.addListener === 'function') {
      this._mediaQuery.addListener(handleChange);
      this._cleanupFn = () => this._mediaQuery.removeListener(handleChange);
    }

    return () => this.dispose();
  }

  /**
   * Clean up event listeners
   */
  dispose() {
    if (this._cleanupFn) {
      this._cleanupFn();
      this._cleanupFn = null;
    }
    this._mediaQuery = null;
  }
}
