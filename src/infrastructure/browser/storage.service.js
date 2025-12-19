/**
 * Storage Service - Abstraction for localStorage API
 *
 * Provides a testable interface for browser storage operations.
 * Handles quota exceeded errors gracefully.
 */
export class StorageService {
  static PROTECTED_KEYS = [
    'gameVolume',
    'statusStripVisible',
    'renderPreset',
    'globalBrightness'
  ];

  /**
   * @param {Object} [options] - Optional configuration
   * @param {Object} [options.logger] - Optional logger instance
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  /**
   * Get item from storage
   * @param {string} key - Storage key
   * @returns {string|null} Stored value or null
   */
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      this.logger.warn(`StorageService.getItem failed for key "${key}":`, error.message);
      return null;
    }
  }

  /**
   * Set item in storage
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   * @returns {boolean} True if successful, false if storage quota exceeded
   */
  setItem(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (error.name === 'QuotaExceededError' || error.code === 22) {
        this.logger.warn('StorageService: Quota exceeded, attempting cleanup');
        this._cleanupOldEntries();

        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          this.logger.error(`StorageService: Quota still exceeded after cleanup for key "${key}"`);
          return false;
        }
      }
      this.logger.error(`StorageService.setItem failed for key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Remove item from storage
   * @param {string} key - Storage key
   */
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      this.logger.warn(`StorageService.removeItem failed for key "${key}":`, error.message);
    }
  }

  /**
   * Cleanup old or less important entries when quota is exceeded
   * @private
   */
  _cleanupOldEntries() {
    const keysToRemove = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !StorageService.PROTECTED_KEYS.includes(key)) {
        keysToRemove.push(key);
      }
    }

    // Remove half of the non-critical entries
    const removeCount = Math.ceil(keysToRemove.length / 2);
    for (let i = 0; i < removeCount && i < keysToRemove.length; i++) {
      try {
        localStorage.removeItem(keysToRemove[i]);
      } catch {
        // Ignore removal errors
      }
    }
  }
}
