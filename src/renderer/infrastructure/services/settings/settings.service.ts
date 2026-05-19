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
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';

const SETTING_DEFINITIONS = SettingsDefinitions.definitions;

type SettingDefinition = (typeof SETTING_DEFINITIONS)[number];
type SettingDefaultValue = string | number | boolean;
type SettingMethod = (...args: unknown[]) => unknown;

interface SettingsDefaults {
  gameVolume: number;
  statusStripVisible: boolean;
  renderPreset: string;
  globalBrightness: number;
  performanceMode: boolean;
  fullscreenOnStartup: boolean;
  minimalistFullscreen: boolean;
  autoStreamOnConnect: boolean;
  launchOnLogin: boolean;
  recordingFormat: string;
}

interface SettingsStorageService {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface SettingsEventBus {
  publish(event: string, payload?: unknown): void;
}

interface SettingsServiceDependencies {
  eventBus: SettingsEventBus;
  loggerFactory: unknown;
  storageService: SettingsStorageService;
}

function createDefinitionMap(): Map<string, SettingDefinition> {
  return new Map(SETTING_DEFINITIONS.map((definition) => [definition.name, definition]));
}

function getDefinitionDefault<T extends SettingDefaultValue>(name: string): T {
  const definition = SETTING_DEFINITIONS.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`Missing settings definition default: ${name}`);
  }
  return definition.default as T;
}

function createDefaultSettings(): SettingsDefaults {
  return {
    gameVolume: getDefinitionDefault<number>('gameVolume'),
    statusStripVisible: getDefinitionDefault<boolean>('statusStripVisible'),
    renderPreset: getDefinitionDefault<string>('renderPreset'),
    globalBrightness: getDefinitionDefault<number>('globalBrightness'),
    performanceMode: getDefinitionDefault<boolean>('performanceMode'),
    fullscreenOnStartup: getDefinitionDefault<boolean>('fullscreenOnStartup'),
    minimalistFullscreen: getDefinitionDefault<boolean>('minimalistFullscreen'),
    autoStreamOnConnect: getDefinitionDefault<boolean>('autoStreamOnConnect'),
    launchOnLogin: getDefinitionDefault<boolean>('launchOnLogin'),
    recordingFormat: getDefinitionDefault<string>('recordingFormat')
  };
}

function getAllowedValues(definition: SettingDefinition): string[] {
  return Array.isArray(definition.allowedValues) ? definition.allowedValues : [];
}

class SettingsService extends BaseService {
  declare eventBus: SettingsEventBus;
  declare storageService: SettingsStorageService;
  settingDefinitions: readonly SettingDefinition[];
  settingDefinitionMap: Map<string, SettingDefinition>;
  defaults: SettingsDefaults;
  validRecordingFormats: string[];
  keys: typeof SettingsStorageKeys;

  constructor(dependencies: SettingsServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'storageService'], 'SettingsService');

    this.settingDefinitions = SETTING_DEFINITIONS;
    this.settingDefinitionMap = createDefinitionMap();
    this.defaults = createDefaultSettings();

    const recordingFormatDefinition = this._getSettingDefinition('recordingFormat');
    this.validRecordingFormats = getAllowedValues(recordingFormatDefinition);

    // Use centralized storage keys
    this.keys = SettingsStorageKeys;
  }

  listSettings(): string[] {
    return this.settingDefinitions.map((definition) => definition.name);
  }

  getSetting(name: string): unknown {
    const definition = this._getSettingDefinition(name);
    const getterName = definition.legacy?.get;
    const getter = getterName ? this[getterName] : undefined;
    if (typeof getter === 'function') {
      return (getter as SettingMethod).call(this);
    }

    const saved = this.storageService?.getItem(definition.storageKey);
    return saved !== null ? saved : definition.default;
  }

  setSetting(name: string, value: unknown): unknown {
    const definition = this._getSettingDefinition(name);
    const setterName = definition.legacy?.set;
    const setter = setterName ? this[setterName] : undefined;
    if (typeof setter === 'function') {
      return (setter as SettingMethod).call(this, value);
    }

    this.storageService?.setItem(definition.storageKey, String(value));
    if (definition.event) {
      this.eventBus.publish(definition.event, value);
    }
    return true;
  }

  _getSettingDefinition(name: string): SettingDefinition {
    const definition = this.settingDefinitionMap.get(name);
    if (!definition) {
      throw new Error(`Unknown setting: ${name}`);
    }
    return definition;
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
  setVolume(volume: number) {
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
  setStatusStripVisible(visible: boolean) {
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
  setRenderPreset(presetId: string) {
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
  setGlobalBrightness(brightness: number) {
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
  setPerformanceMode(enabled: boolean) {
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
  setFullscreenOnStartup(enabled: boolean) {
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
  setMinimalistFullscreen(enabled: boolean) {
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
  setAutoStreamOnConnect(enabled: boolean) {
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
    } catch {
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
  async setLaunchOnLogin(enabled: boolean) {
    try {
      if (window.loginItemAPI?.set) {
        await window.loginItemAPI.set(enabled);
      }
    } catch {
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
  setRecordingFormat(format: string) {
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
