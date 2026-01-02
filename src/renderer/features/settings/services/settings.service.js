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

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

/**
 * Storage keys that should be protected from cleanup when quota is exceeded
 * These are critical user preferences that should always be preserved
 */
const PROTECTED_STORAGE_KEYS = [
  'gameVolume',
  'statusStripVisible',
  'renderPreset',
  'globalBrightness',
  'fullscreenOnStartup',
  'userNotes',
  'notesPanelPosition'
];

class SettingsService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'storageService'], 'SettingsService');

    // Default settings
    this.defaults = {
      gameVolume: 70,
      statusStripVisible: false,
      renderPreset: 'vibrant',
      globalBrightness: 1.0,
      performanceMode: false,
      fullscreenOnStartup: false
    };

    this.keys = {
      VOLUME: 'gameVolume',
      STATUS_STRIP: 'statusStripVisible',
      RENDER_PRESET: 'renderPreset',
      GLOBAL_BRIGHTNESS: 'globalBrightness',
      PERFORMANCE_MODE: 'performanceMode',
      FULLSCREEN_ON_STARTUP: 'fullscreenOnStartup'
    };
  }

  /**
   * Load all saved preferences
   * @returns {Object} All preferences
   */
  loadAllPreferences() {
    const volume = this.getVolume();
    const statusStripVisible = this.getStatusStripVisible();
    const performanceMode = this.getPerformanceMode();

    this.logger.info(`Loaded preferences - Volume: ${volume}%, StatusStrip: ${statusStripVisible}, PerformanceMode: ${performanceMode}`);

    return {
      volume,
      statusStripVisible,
      performanceMode
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

  /**
   * Get performance mode preference
   * @returns {boolean} True if performance mode is enabled (Canvas2D, minimal shaders, no CSS animations)
   */
  getPerformanceMode() {
    const saved = this.storageService?.getItem(this.keys.PERFORMANCE_MODE);
    return saved !== null ? saved === 'true' : this.defaults.performanceMode;
  }

  /**
   * Set performance mode preference
   * @param {boolean} enabled - Enable performance mode (Canvas2D, minimal shaders, no CSS animations)
   */
  setPerformanceMode(enabled) {
    this.storageService?.setItem(this.keys.PERFORMANCE_MODE, enabled.toString());

    this.logger.debug(`Performance mode ${enabled ? 'enabled' : 'disabled'}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, enabled);
  }

  /**
   * Get fullscreen on startup preference
   * @returns {boolean} True if fullscreen on startup is enabled
   */
  getFullscreenOnStartup() {
    const saved = this.storageService?.getItem(this.keys.FULLSCREEN_ON_STARTUP);
    return saved !== null ? saved === 'true' : this.defaults.fullscreenOnStartup;
  }

  /**
   * Set fullscreen on startup preference
   * @param {boolean} enabled - Enable fullscreen on startup
   */
  setFullscreenOnStartup(enabled) {
    this.storageService?.setItem(this.keys.FULLSCREEN_ON_STARTUP, enabled.toString());

    this.logger.debug(`Fullscreen on startup ${enabled ? 'enabled' : 'disabled'}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.FULLSCREEN_ON_STARTUP_CHANGED, enabled);
  }
}

export { SettingsService, PROTECTED_STORAGE_KEYS };
