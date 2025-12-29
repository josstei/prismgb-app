/**
 * Filename Generator - Centralized file naming utilities
 * Provides consistent timestamp and filename generation
 */

class FilenameGenerator {
  /**
   * Generate timestamp in format: YYYYMMDD-HHMMSS-mmm
   * Includes milliseconds to avoid filename collisions for rapid captures
   * @returns {string} Formatted timestamp
   */
  static timestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}${month}${day}-${hours}${minutes}${seconds}-${millis}`;
  }

  /**
   * Generate screenshot filename
   * @returns {string} Screenshot filename
   * @example 'prismgb-screenshot-20250120-143022.png'
   */
  static forScreenshot() {
    return `prismgb-screenshot-${this.timestamp()}.png`;
  }

  /**
   * Generate recording filename
   * @returns {string} Recording filename
   * @example 'prismgb-recording-20250120-143022.webm'
   */
  static forRecording() {
    return `prismgb-recording-${this.timestamp()}.webm`;
  }
}

export { FilenameGenerator };
