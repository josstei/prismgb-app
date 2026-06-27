import { Service } from '@prismgb/core';
import { BaseService } from '@prismgb/core';
import { SettingsDefinitions } from '@renderer/lib/settings.definitions.js';
import type { StorageServiceLike } from '@prismgb/core';

type SettingDefinition = (typeof SettingsDefinitions.definitions)[number];
type SettingDefaultValue = string | number | boolean;
type SettingValue = SettingDefaultValue;
type SettingResult = SettingValue | Promise<SettingValue>;
type SettingValidation = {
  min?: number;
  max?: number;
  clamp?: boolean;
};

interface SettingsEventBus {
  publish(event: string, payload?: unknown): void;
}

interface SettingsServiceDependencies {
  eventBus: SettingsEventBus;
  loggerFactory: unknown;
  storageService: StorageServiceLike;
}

function createDefinitionMap(definitions: readonly SettingDefinition[]): Map<string, SettingDefinition> {
  return new Map(definitions.map((definition: any) => [definition.name, definition]));
}

function getAllowedValues(definition: SettingDefinition): string[] {
  return Array.isArray(definition.allowedValues) ? definition.allowedValues : [];
}

@Service({
  "token": "settingsService",
  "disposal": "dispose"
})
class SettingsService extends BaseService {
  private readonly eventBus: SettingsEventBus;
  private readonly storageService: StorageServiceLike;
  private readonly settingDefinitions: readonly SettingDefinition[];
  private readonly settingDefinitionMap: Map<string, SettingDefinition>;

  constructor(dependencies: SettingsServiceDependencies) {
    super(dependencies, 'SettingsService');

    this.eventBus = dependencies.eventBus;
    this.storageService = dependencies.storageService;
    this.settingDefinitions = SettingsDefinitions.definitions;
    this.settingDefinitionMap = createDefinitionMap(this.settingDefinitions);
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
    const saved = this.storageService.getItem(definition.storageKey);
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

    if (!this.storageService.setItem(definition.storageKey, String(normalized.value))) {
      return false;
    }
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
        const result = await window.loginItemAPI.get();
        const enabled = result.success ? result.enabled : false;
        this.storageService.setItem(definition.storageKey, enabled.toString());
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
        const result = await window.loginItemAPI.set(enabled);
        if (!result.success) {
          this.logger.error('Failed to set login item state in main process', result.error);
          return false;
        }
      } else {
        this.logger.error('Login item API not available');
        return false;
      }
    } catch {
      this.logger.error('Failed to set login item state in main process');
      return false;
    }

    const stored = this.storageService.setItem(definition.storageKey, enabled.toString());
    if (stored) {
      this.logger.debug(`Setting ${definition.name} set to ${enabled}`);
    }
    return stored;
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
      SettingsDefinitions.loadAllPreferencesShape.map((name: string) => [name, this._getSynchronousSetting(name)])
    );

    const summary = SettingsDefinitions.loadAllPreferencesShape
      .map((name: string) => `${name}: ${String(preferences[name])}`)
      .join(', ');
    this.logger.info(`Loaded preferences - ${summary}`);

    return preferences;
  }
}

export { SettingsService };
