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
import { SettingsStorageKeys } from '@shared/config/storage-keys.config';

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
      fullscreenOnStartup: false,
      minimalistFullscreen: false,
      autoStreamOnConnect: false,
      recordingFormat: 'webm',
      launchOnLogin: false
    };

    // Valid recording formats
    this.validRecordingFormats = ['webm', 'mp4', 'mov'];

    // Use centralized storage keys
    this.keys = SettingsStorageKeys;
  }

  /**
   * Load all saved preferences
   * @returns {Object} All preferences
   */
  loadAllPreferences() {
    const volume = this.getVolume();
    const statusStripVisible = this.getStatusStripVisible();
    const performanceMode = this.getPerformanceMode();
    const minimalistFullscreen = this.getMinimalistFullscreen();

    this.logger.info(
      `Loaded preferences - Volume: ${volume}%, StatusStrip: ${statusStripVisible}, PerformanceMode: ${performanceMode}, MinimalistFullscreen: ${minimalistFullscreen}`
    );

    return {
      volume,
      statusStripVisible,
      performanceMode,
      minimalistFullscreen
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
  }

  /**
   * Get minimalist fullscreen preference
   * @returns {boolean} True if minimalist fullscreen is enabled
   */
  getMinimalistFullscreen() {
    const saved = this.storageService?.getItem(this.keys.MINIMALIST_FULLSCREEN);
    return saved !== null ? saved === 'true' : this.defaults.minimalistFullscreen;
  }

  /**
   * Set minimalist fullscreen preference
   * @param {boolean} enabled - Enable minimalist fullscreen
   */
  setMinimalistFullscreen(enabled) {
    this.storageService?.setItem(this.keys.MINIMALIST_FULLSCREEN, enabled.toString());

    this.logger.debug(`Minimalist fullscreen ${enabled ? 'enabled' : 'disabled'}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, enabled);
  }

  /**
   * Get auto-stream on connect preference
   * @returns {boolean} True if auto-stream on connect is enabled
   */
  getAutoStreamOnConnect() {
    const saved = this.storageService?.getItem(this.keys.AUTO_STREAM_ON_CONNECT);
    return saved !== null ? saved === 'true' : this.defaults.autoStreamOnConnect;
  }

  /**
   * Set auto-stream on connect preference
   * @param {boolean} enabled - Enable auto-stream on connect
   */
  setAutoStreamOnConnect(enabled) {
    this.storageService?.setItem(this.keys.AUTO_STREAM_ON_CONNECT, enabled.toString());

    this.logger.debug(`Auto-stream on connect ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get launch on login preference
   * Queries main process for OS-level state, falls back to localStorage cache
   * @returns {Promise<boolean>} True if launch on login is enabled
   */
  async getLaunchOnLogin() {
    try {
      if (window.loginItemAPI?.get) {
        const enabled = await window.loginItemAPI.get();
        this.storageService?.setItem(this.keys.LAUNCH_ON_LOGIN, enabled.toString());
        return enabled;
      }
    } catch (error) {
      this.logger.warn('Failed to query login item state from main process');
    }

    const saved = this.storageService?.getItem(this.keys.LAUNCH_ON_LOGIN);
    return saved !== null ? saved === 'true' : this.defaults.launchOnLogin;
  }

  /**
   * Set launch on login preference
   * Updates OS-level login item via main process and caches locally
   * @param {boolean} enabled - Enable launch on login
   */
  async setLaunchOnLogin(enabled) {
    try {
      if (window.loginItemAPI?.set) {
        await window.loginItemAPI.set(enabled);
      }
    } catch (error) {
      this.logger.error('Failed to set login item state in main process');
    }

    this.storageService?.setItem(this.keys.LAUNCH_ON_LOGIN, enabled.toString());
    this.logger.debug(`Launch on login ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get recording format preference
   * @returns {string} Recording format (webm, mp4, or mov)
   */
  getRecordingFormat() {
    const saved = this.storageService?.getItem(this.keys.RECORDING_FORMAT);
    if (saved !== null && this.validRecordingFormats.includes(saved)) {
      return saved;
    }
    return this.defaults.recordingFormat;
  }

  /**
   * Set recording format preference
   * @param {string} format - Recording format (webm, mp4, or mov)
   * @returns {boolean} True if format was valid and saved
   */
  setRecordingFormat(format) {
    if (!this.validRecordingFormats.includes(format)) {
      this.logger.warn(`Invalid recording format: ${format}. Valid formats: ${this.validRecordingFormats.join(', ')}`);
      return false;
    }

    this.storageService?.setItem(this.keys.RECORDING_FORMAT, format);
    this.logger.debug(`Recording format set to ${format}`);

    // Emit event
    this.eventBus.publish(EventChannels.SETTINGS.RECORDING_FORMAT_CHANGED, format);
    return true;
  }
}

export { SettingsService };
