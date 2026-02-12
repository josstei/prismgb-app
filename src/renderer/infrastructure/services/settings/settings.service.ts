/**
 * Settings Service
 *
 * Centralized localStorage management for user preferences
 * 100% UI-agnostic - emits events when settings change
 */

import { BaseService } from '@prismgb/core';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { SettingsStorageKeys } from '@shared/config/storage-keys.config';

type SettingsDefaults = {
  gameVolume: number;
  statusStripVisible: boolean;
  renderPreset: string;
  globalBrightness: number;
  performanceMode: boolean;
  fullscreenOnStartup: boolean;
  minimalistFullscreen: boolean;
  autoStreamOnConnect: boolean;
  recordingFormat: string;
};

type SettingsEventBus = {
  publish(channel: string, payload?: unknown): void;
};

type SettingsStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

type SettingsLogger = {
  info(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

interface SettingsServiceDependencies {
  eventBus: SettingsEventBus;
  loggerFactory: { create(name: string): SettingsLogger };
  storageService: SettingsStorage;
}

type SettingDefinition<TValue> = {
  key: string;
  defaultValue: TValue;
  parse: (storedValue: string) => TValue;
  normalize?: (nextValue: TValue) => TValue;
  serialize?: (value: TValue) => string;
  eventChannel?: string;
  logMessage?: (value: TValue) => string;
};

type SettingCatalog = {
  volume: SettingDefinition<number>;
  statusStripVisible: SettingDefinition<boolean>;
  renderPreset: SettingDefinition<string>;
  globalBrightness: SettingDefinition<number>;
  performanceMode: SettingDefinition<boolean>;
  fullscreenOnStartup: SettingDefinition<boolean>;
  minimalistFullscreen: SettingDefinition<boolean>;
  autoStreamOnConnect: SettingDefinition<boolean>;
  recordingFormat: SettingDefinition<string>;
};

class SettingsService extends BaseService {
  static readonly dependencies = ['eventBus', 'loggerFactory', 'storageService'] as const;

  declare eventBus: SettingsEventBus;
  declare storageService: SettingsStorage;
  declare logger: SettingsLogger;

  readonly defaults: SettingsDefaults;
  readonly validRecordingFormats: readonly string[];
  readonly keys: typeof SettingsStorageKeys;

  private readonly _settings: SettingCatalog;

  constructor(dependencies: SettingsServiceDependencies) {
    super(dependencies, [...SettingsService.dependencies], 'SettingsService');

    this.defaults = {
      gameVolume: 70,
      statusStripVisible: false,
      renderPreset: 'vibrant',
      globalBrightness: 1.0,
      performanceMode: false,
      fullscreenOnStartup: false,
      minimalistFullscreen: false,
      autoStreamOnConnect: false,
      recordingFormat: 'webm'
    };

    this.validRecordingFormats = ['webm', 'mp4', 'mov'];
    this.keys = SettingsStorageKeys;

    this._settings = {
      volume: {
        key: this.keys.VOLUME,
        defaultValue: this.defaults.gameVolume,
        parse: (storedValue) => parseInt(storedValue, 10),
        normalize: (nextValue) => Math.max(0, Math.min(100, nextValue)),
        serialize: (value) => value.toString(),
        eventChannel: EventChannels.SETTINGS.VOLUME_CHANGED
      },
      statusStripVisible: {
        key: this.keys.STATUS_STRIP,
        defaultValue: this.defaults.statusStripVisible,
        parse: (storedValue) => storedValue === 'true',
        serialize: (value) => value.toString(),
        logMessage: (visible) => `Status strip ${visible ? 'shown' : 'hidden'}`
      },
      renderPreset: {
        key: this.keys.RENDER_PRESET,
        defaultValue: this.defaults.renderPreset,
        parse: (storedValue) => storedValue,
        eventChannel: EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
        logMessage: (presetId) => `Render preset set to ${presetId}`
      },
      globalBrightness: {
        key: this.keys.GLOBAL_BRIGHTNESS,
        defaultValue: this.defaults.globalBrightness,
        parse: (storedValue) => parseFloat(storedValue),
        normalize: (nextValue) => Math.max(0.5, Math.min(1.5, nextValue)),
        serialize: (value) => value.toString(),
        eventChannel: EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        logMessage: (brightness) => `Global brightness set to ${brightness.toFixed(2)}`
      },
      performanceMode: {
        key: this.keys.PERFORMANCE_MODE,
        defaultValue: this.defaults.performanceMode,
        parse: (storedValue) => storedValue === 'true',
        serialize: (value) => value.toString(),
        eventChannel: EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
        logMessage: (enabled) => `Performance mode ${enabled ? 'enabled' : 'disabled'}`
      },
      fullscreenOnStartup: {
        key: this.keys.FULLSCREEN_ON_STARTUP,
        defaultValue: this.defaults.fullscreenOnStartup,
        parse: (storedValue) => storedValue === 'true',
        serialize: (value) => value.toString(),
        logMessage: (enabled) => `Fullscreen on startup ${enabled ? 'enabled' : 'disabled'}`
      },
      minimalistFullscreen: {
        key: this.keys.MINIMALIST_FULLSCREEN,
        defaultValue: this.defaults.minimalistFullscreen,
        parse: (storedValue) => storedValue === 'true',
        serialize: (value) => value.toString(),
        eventChannel: EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
        logMessage: (enabled) => `Minimalist fullscreen ${enabled ? 'enabled' : 'disabled'}`
      },
      autoStreamOnConnect: {
        key: this.keys.AUTO_STREAM_ON_CONNECT,
        defaultValue: this.defaults.autoStreamOnConnect,
        parse: (storedValue) => storedValue === 'true',
        serialize: (value) => value.toString(),
        logMessage: (enabled) => `Auto-stream on connect ${enabled ? 'enabled' : 'disabled'}`
      },
      recordingFormat: {
        key: this.keys.RECORDING_FORMAT,
        defaultValue: this.defaults.recordingFormat,
        parse: (storedValue) => storedValue,
        eventChannel: EventChannels.SETTINGS.RECORDING_FORMAT_CHANGED,
        logMessage: (format) => `Recording format set to ${format}`
      }
    };
  }

  loadAllPreferences(): {
    volume: number;
    statusStripVisible: boolean;
    performanceMode: boolean;
    minimalistFullscreen: boolean;
  } {
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

  getVolume(): number {
    return this._read(this._settings.volume);
  }

  setVolume(volume: number): void {
    this._write(this._settings.volume, volume);
  }

  getStatusStripVisible(): boolean {
    return this._read(this._settings.statusStripVisible);
  }

  setStatusStripVisible(visible: boolean): void {
    this._write(this._settings.statusStripVisible, visible);
  }

  getRenderPreset(): string {
    return this._read(this._settings.renderPreset);
  }

  setRenderPreset(presetId: string): void {
    this._write(this._settings.renderPreset, presetId);
  }

  getGlobalBrightness(): number {
    return this._read(this._settings.globalBrightness);
  }

  setGlobalBrightness(brightness: number): void {
    this._write(this._settings.globalBrightness, brightness);
  }

  getPerformanceMode(): boolean {
    return this._read(this._settings.performanceMode);
  }

  setPerformanceMode(enabled: boolean): void {
    this._write(this._settings.performanceMode, enabled);
  }

  getFullscreenOnStartup(): boolean {
    return this._read(this._settings.fullscreenOnStartup);
  }

  setFullscreenOnStartup(enabled: boolean): void {
    this._write(this._settings.fullscreenOnStartup, enabled);
  }

  getMinimalistFullscreen(): boolean {
    return this._read(this._settings.minimalistFullscreen);
  }

  setMinimalistFullscreen(enabled: boolean): void {
    this._write(this._settings.minimalistFullscreen, enabled);
  }

  getAutoStreamOnConnect(): boolean {
    return this._read(this._settings.autoStreamOnConnect);
  }

  setAutoStreamOnConnect(enabled: boolean): void {
    this._write(this._settings.autoStreamOnConnect, enabled);
  }

  getRecordingFormat(): string {
    const format = this._read(this._settings.recordingFormat);
    if (this.validRecordingFormats.includes(format)) {
      return format;
    }
    return this.defaults.recordingFormat;
  }

  setRecordingFormat(format: string): boolean {
    if (!this.validRecordingFormats.includes(format)) {
      this.logger.warn(`Invalid recording format: ${format}. Valid formats: ${this.validRecordingFormats.join(', ')}`);
      return false;
    }

    this._write(this._settings.recordingFormat, format);
    return true;
  }

  private _read<TValue>(definition: SettingDefinition<TValue>): TValue {
    const storedValue = this.storageService?.getItem(definition.key);
    if (storedValue === null) {
      return definition.defaultValue;
    }

    const parsed = definition.parse(storedValue);
    return parsed ?? definition.defaultValue;
  }

  private _write<TValue>(definition: SettingDefinition<TValue>, nextValue: TValue): TValue {
    const normalizedValue = definition.normalize ? definition.normalize(nextValue) : nextValue;
    const serializedValue = definition.serialize
      ? definition.serialize(normalizedValue)
      : String(normalizedValue);

    this.storageService?.setItem(definition.key, serializedValue);

    if (definition.logMessage) {
      this.logger.debug(definition.logMessage(normalizedValue));
    }

    if (definition.eventChannel) {
      this.eventBus.publish(definition.eventChannel, normalizedValue);
    }

    return normalizedValue;
  }
}

export { SettingsService };
