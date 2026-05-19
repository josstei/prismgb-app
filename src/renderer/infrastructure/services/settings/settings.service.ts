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
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions.js';

const SETTING_DEFINITIONS = SettingsDefinitions.definitions;

type SettingDefinition = (typeof SETTING_DEFINITIONS)[number];
type SettingDefaultValue = string | number | boolean;
type SettingValue = SettingDefaultValue;
type SettingResult = SettingValue | Promise<SettingValue>;
type SettingValidation = {
  min?: number;
  max?: number;
  clamp?: boolean;
};

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

function getAllowedValues(definition: SettingDefinition): string[] {
  return Array.isArray(definition.allowedValues) ? definition.allowedValues : [];
}

class SettingsService extends BaseService {
  declare eventBus: SettingsEventBus;
  declare storageService: SettingsStorageService;
  private readonly settingDefinitions: readonly SettingDefinition[];
  private readonly settingDefinitionMap: Map<string, SettingDefinition>;

  constructor(dependencies: SettingsServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'storageService'], 'SettingsService');

    this.settingDefinitions = SETTING_DEFINITIONS;
    this.settingDefinitionMap = createDefinitionMap();
  }

  listSettings(): string[] {
    return this.settingDefinitions.map((definition) => definition.name);
  }

  getAllowedValues(name: string): string[] {
    return getAllowedValues(this._getSettingDefinition(name));
  }

  getSetting(name: string): SettingResult {
    const definition = this._getSettingDefinition(name);

    if (this._usesLoginItemAPI(definition)) {
      return this._readLoginItemSetting(definition);
    }

    return this._readStoredSetting(definition);
  }

  setSetting(name: string, value: unknown): boolean | Promise<boolean> {
    const definition = this._getSettingDefinition(name);

    if (this._usesLoginItemAPI(definition)) {
      return this._writeLoginItemSetting(definition, value);
    }

    return this._writeStoredSetting(definition, value);
  }

  getNumberSetting(name: string): number {
    const value = this._getSynchronousSetting(name);
    if (typeof value === 'number') {
      return value;
    }
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
    throw new Error(`Setting is not numeric: ${name}`);
  }

  getBooleanSetting(name: string): boolean {
    const value = this._getSynchronousSetting(name);
    return this._normalizeBoolean(value);
  }

  getStringSetting(name: string): string {
    const value = this._getSynchronousSetting(name);
    return String(value);
  }

  _getSynchronousSetting(name: string): SettingValue {
    const value = this.getSetting(name);
    if (this._isPromiseLike(value)) {
      throw new Error(`Setting requires asynchronous access: ${name}`);
    }
    return value;
  }

  _readStoredSetting(definition: SettingDefinition): SettingValue {
    const saved = this.storageService?.getItem(definition.storageKey);
    if (saved === null || saved === undefined) {
      return definition.default as SettingValue;
    }

    switch (definition.type) {
      case 'boolean':
        return saved === 'true';
      case 'number': {
        const parsed = Number.parseFloat(saved);
        return Number.isFinite(parsed) ? parsed : definition.default as number;
      }
      case 'enum': {
        const allowedValues = getAllowedValues(definition);
        return allowedValues.includes(saved) ? saved : definition.default as string;
      }
      case 'string':
      default:
        return saved;
    }
  }

  _writeStoredSetting(definition: SettingDefinition, value: unknown): boolean {
    const normalized = this._normalizeSettingValue(definition, value);
    if (!normalized.ok) {
      return false;
    }

    this.storageService?.setItem(definition.storageKey, String(normalized.value));
    if (definition.event) {
      this.eventBus.publish(definition.event, normalized.value);
    }
    this.logger.debug(`Setting ${definition.name} set to ${normalized.value}`);
    return true;
  }

  _normalizeSettingValue(definition: SettingDefinition, value: unknown): { ok: true; value: SettingValue } | { ok: false } {
    switch (definition.type) {
      case 'boolean':
        return { ok: true, value: this._normalizeBoolean(value) };
      case 'number': {
        const parsed = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(parsed)) {
          this.logger.warn(`Invalid numeric setting value for ${definition.name}: ${String(value)}`);
          return { ok: false };
        }
        return { ok: true, value: this._applyNumberValidation(definition, parsed) };
      }
      case 'enum': {
        const normalized = String(value);
        const allowedValues = getAllowedValues(definition);
        if (!allowedValues.includes(normalized)) {
          this.logger.warn(`Invalid ${definition.name}: ${normalized}. Valid values: ${allowedValues.join(', ')}`);
          return { ok: false };
        }
        return { ok: true, value: normalized };
      }
      case 'string':
      default:
        return { ok: true, value: String(value) };
    }
  }

  _applyNumberValidation(definition: SettingDefinition, value: number): number {
    const validation = (definition as SettingDefinition & { validation?: SettingValidation }).validation;
    if (!validation?.clamp) {
      return value;
    }

    const min = typeof validation.min === 'number' ? validation.min : value;
    const max = typeof validation.max === 'number' ? validation.max : value;
    return Math.max(min, Math.min(max, value));
  }

  _normalizeBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return Boolean(value);
  }

  _usesLoginItemAPI(definition: SettingDefinition): boolean {
    return definition.name === 'launchOnLogin'
      && (definition as SettingDefinition & { externalSource?: string }).externalSource === 'window.loginItemAPI';
  }

  async _readLoginItemSetting(definition: SettingDefinition): Promise<boolean> {
    try {
      if (window.loginItemAPI?.get) {
        const enabled = await window.loginItemAPI.get();
        this.storageService?.setItem(definition.storageKey, enabled.toString());
        return enabled;
      }
    } catch {
      this.logger.warn('Failed to query login item state from main process');
    }

    return this._readStoredSetting(definition) as boolean;
  }

  async _writeLoginItemSetting(definition: SettingDefinition, value: unknown): Promise<boolean> {
    const enabled = this._normalizeBoolean(value);
    try {
      if (window.loginItemAPI?.set) {
        await window.loginItemAPI.set(enabled);
      }
    } catch {
      this.logger.error('Failed to set login item state in main process');
    }

    this.storageService?.setItem(definition.storageKey, enabled.toString());
    this.logger.debug(`Setting ${definition.name} set to ${enabled}`);
    return true;
  }

  _isPromiseLike(value: unknown): value is Promise<SettingValue> {
    return typeof value === 'object'
      && value !== null
      && 'then' in value
      && typeof (value as { then?: unknown }).then === 'function';
  }

  _getSettingDefinition(name: string): SettingDefinition {
    const definition = this.settingDefinitionMap.get(name);
    if (!definition) {
      throw new Error(`Unknown setting: ${name}`);
    }
    return definition;
  }

  /**
   * Load all saved preferences.
   * @returns {Object} Preferences keyed by settings definition names.
   */
  loadAllPreferences() {
    const preferences = Object.fromEntries(
      SettingsDefinitions.loadAllPreferencesShape.map((name) => [name, this.getSetting(name)])
    );

    this.logger.info(
      `Loaded preferences - GameVolume: ${preferences.gameVolume}%, StatusStrip: ${preferences.statusStripVisible}, PerformanceMode: ${preferences.performanceMode}, MinimalistFullscreen: ${preferences.minimalistFullscreen}`
    );

    return preferences;
  }
}

export { SettingsService };
