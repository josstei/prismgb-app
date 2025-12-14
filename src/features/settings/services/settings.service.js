/**
 * Settings Service
 *
 * Centralized localStorage management for user preferences
 * 100% UI-agnostic - emits events when settings change
 *
 * Events emitted:
 * - 'settings:volume-changed' - Volume changed
 * - 'settings:cinematic-changed' - Cinematic mode changed
 * - 'settings:status-strip-changed' - Status strip visibility changed
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

class SettingsService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'SettingsService');

    // Browser abstraction service
    this.storageService = dependencies.storageService;

    // Default settings
    this.defaults = {
      gameVolume: 70,
      statusStripVisible: false,
      renderPreset: 'vibrant',
      globalBrightness: 1.0
    };

    // Setting keys
    this.keys = {
      VOLUME: 'gameVolume',
      STATUS_STRIP: 'statusStripVisible',
      RENDER_PRESET: 'renderPreset',
      GLOBAL_BRIGHTNESS: 'globalBrightness'
    };
  }

  /**
   * Load all saved preferences
   * @returns {Object} All preferences
   */
  loadAllPreferences() {
    const volume = this.getVolume();
    const statusStripVisible = this.getStatusStripVisible();

    this.logger.info(`Loaded preferences - Volume: ${volume}%, StatusStrip: ${statusStripVisible}`);

    return {
      volume,
      statusStripVisible
    };
  }

  /**
   * Get saved volume preference
   * @returns {number} Volume (0-100)
   */
  getVolume() {
    const saved = this.storageService?.getItem(this.keys.VOLUME);
    return saved !== null ? parseInt(saved) : this.defaults.gameVolume;
  }

  /**
   * Save volume preference
   * @param {number} volume - Volume (0-100)
   */
  setVolume(volume) {
    const clampedVolume = Math.max(0, Math.min(100, volume));
    this.storageService?.setItem(this.keys.VOLUME, clampedVolume.toString());

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, clampedVolume);
  }

  /**
   * Get saved status strip visibility preference
   * @returns {boolean} Status strip visible
   */
  getStatusStripVisible() {
    const saved = this.storageService?.getItem(this.keys.STATUS_STRIP);
    return saved !== null ? saved === 'true' : this.defaults.statusStripVisible;
  }

  /**
   * Save status strip visibility preference
   * @param {boolean} visible - Status strip visible
   */
  setStatusStripVisible(visible) {
    this.storageService?.setItem(this.keys.STATUS_STRIP, visible.toString());

    this.logger.debug(`Status strip ${visible ? 'shown' : 'hidden'}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.STATUS_STRIP_CHANGED, visible);
  }

  /**
   * Get saved render preset preference
   * @returns {string} Render preset ID
   */
  getRenderPreset() {
    const saved = this.storageService?.getItem(this.keys.RENDER_PRESET);
    return saved !== null ? saved : this.defaults.renderPreset;
  }

  /**
   * Save render preset preference
   * @param {string} presetId - Render preset ID
   */
  setRenderPreset(presetId) {
    this.storageService?.setItem(this.keys.RENDER_PRESET, presetId);

    this.logger.debug(`Render preset set to ${presetId}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.RENDER_PRESET_CHANGED, presetId);
  }

  /**
   * Get saved global brightness preference
   * @returns {number} Global brightness multiplier (0.5-1.5)
   */
  getGlobalBrightness() {
    const saved = this.storageService?.getItem(this.keys.GLOBAL_BRIGHTNESS);
    return saved !== null ? parseFloat(saved) : this.defaults.globalBrightness;
  }

  /**
   * Save global brightness preference
   * @param {number} brightness - Brightness multiplier (0.5-1.5)
   */
  setGlobalBrightness(brightness) {
    const clampedBrightness = Math.max(0.5, Math.min(1.5, brightness));
    this.storageService?.setItem(this.keys.GLOBAL_BRIGHTNESS, clampedBrightness.toString());

    this.logger.debug(`Global brightness set to ${clampedBrightness.toFixed(2)}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, clampedBrightness);
  }
}

export { SettingsService };
