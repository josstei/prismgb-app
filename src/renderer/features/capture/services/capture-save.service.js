/**
 * Capture Save Service
 *
 * Coordinates saving recordings and screenshots with optional transcoding.
 * For recordings, checks the user's format preference and routes to
 * direct save (webm) or transcode (mp4/mov).
 *
 * Note: UI status feedback for transcode events is handled by TranscodeUIBridge.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

class CaptureSaveService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'settingsService', 'transcodeService', 'loggerFactory'],
      'CaptureSaveService'
    );
  }

  /**
   * Save a recording, transcoding if the user's format preference differs from webm
   * @param {Blob} blob - The recording blob (webm format)
   * @param {string} filename - The original filename (used as base for transcoded file)
   * @returns {Promise<{success: boolean, transcoded?: boolean, error?: string}>}
   */
  async saveRecording(blob, filename) {
    const format = this.settingsService.getRecordingFormat();

    this.logger.info(`Saving recording with format preference: ${format}`);

    // If format is webm or transcoding is not available, use direct download
    if (format === 'webm' || !this.transcodeService.isAvailable()) {
      return this._directSave(blob, filename);
    }

    // Transcoding needed - the main process will save the file
    // Extract base name (without extension) for consistent naming
    const baseName = filename.replace(/\.[^.]+$/, '');
    return this._transcodeAndSave(blob, format, baseName);
  }

  /**
   * Save a screenshot directly (no transcoding needed)
   * @param {Blob} blob - The screenshot blob
   * @param {string} filename - The filename
   * @returns {Promise<{success: boolean}>}
   */
  async saveScreenshot(blob, filename) {
    return this._directSave(blob, filename);
  }

  /**
   * Direct save using browser download
   * @param {Blob} blob - The blob to save
   * @param {string} filename - The filename
   * @returns {{success: boolean}}
   * @private
   */
  _directSave(blob, filename) {
    try {
      // Create download link and trigger it
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Revoke the URL after a short delay to allow download to start
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      this.logger.info(`Direct save completed: ${filename}`);
      return { success: true, transcoded: false };
    } catch (error) {
      this.logger.error('Direct save failed', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Transcode and save via main process
   * @param {Blob} blob - The source blob
   * @param {string} format - Target format (mp4, mov)
   * @param {string} outputBaseName - Base name for output file (without extension)
   * @returns {Promise<{success: boolean, transcoded?: boolean, error?: string}>}
   * @private
   */
  async _transcodeAndSave(blob, format, outputBaseName) {
    try {
      this.logger.info(`Starting transcode to ${format}`);

      // Start transcode - main process handles file saving
      // UI status is handled by TranscodeUIBridge listening to TRANSCODE events
      const result = await this.transcodeService.transcode(blob, format, outputBaseName);

      if (!result.success) {
        this.logger.error('Transcode failed', result.error);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
          message: `Conversion failed: ${result.error}`,
          type: 'error'
        });
        return { success: false, error: result.error };
      }

      // Transcode started successfully - completion will be handled by TranscodeUIBridge
      return { success: true, transcoded: true };
    } catch (error) {
      this.logger.error('Transcode and save failed', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: `Conversion failed: ${error.message}`,
        type: 'error'
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Cleanup resources
   */
  dispose() {
    this.logger.info('CaptureSaveService disposed');
  }
}

export { CaptureSaveService };
