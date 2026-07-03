import { injectable, inject } from 'inversify';
import { BaseService, isPromiseLike } from '@platform/core';
import { EventChannels } from '@platform/events';
import { SettingsDefinitions, getStartupPreferenceEventDefinitions } from '@renderer/lib/settings.definitions.js';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { LoggerFactoryLike, LoggerLike, StorageServiceLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type SettingDefinition = (typeof SettingsDefinitions.definitions)[number];
type SettingDefaultValue = string | number | boolean;
type SettingValue = SettingDefaultValue;
type SettingResult = SettingValue | Promise<SettingValue>;
type SettingValidation = {
  min?: number;
  max?: number;
  clamp?: boolean;
};
type SettingEncodeResult = { ok: true; value: SettingValue } | { ok: false };

/**
 * Per-type codec for a setting's storage representation. `decode` and
 * `encode` are deliberately asymmetric: decode returns a plain value with a
 * default fallback (a corrupt/absent stored value must never throw), while
 * encode returns a `{ ok, value }` rejection contract (an invalid write must
 * be refused without corrupting storage).
 */
interface SettingCodec {
  decode(saved: string, definition: SettingDefinition): SettingValue;
  encode(value: unknown, definition: SettingDefinition, logger: LoggerLike): SettingEncodeResult;
}

interface SettingsEventBus {
  publish(event: string, payload?: unknown): void;
}

function createDefinitionMap(definitions: readonly SettingDefinition[]): Map<string, SettingDefinition> {
  return new Map(definitions.map((definition: any) => [definition.name, definition]));
}

function getAllowedValues(definition: SettingDefinition): string[] {
  return Array.isArray(definition.allowedValues) ? definition.allowedValues : [];
}

function normalizeBooleanValue(value: unknown): boolean {
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

function applyNumberValidation(definition: SettingDefinition, value: number): number {
  const validation = (definition as SettingDefinition & { validation?: SettingValidation }).validation;
  if (!validation?.clamp) {
    return value;
  }

  const min = typeof validation.min === 'number' ? validation.min : value;
  const max = typeof validation.max === 'number' ? validation.max : value;
  return Math.max(min, Math.min(max, value));
}

const BOOLEAN_SETTING_CODEC: SettingCodec = {
  decode: (saved) => saved === 'true',
  encode: (value) => ({ ok: true, value: normalizeBooleanValue(value) })
};

const NUMBER_SETTING_CODEC: SettingCodec = {
  decode: (saved, definition) => {
    const parsed = Number.parseFloat(saved);
    return Number.isFinite(parsed) ? parsed : definition.default as number;
  },
  encode: (value, definition, logger) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      logger.warn(`Invalid numeric setting value for ${definition.name}: ${String(value)}`);
      return { ok: false };
    }
    return { ok: true, value: applyNumberValidation(definition, parsed) };
  }
};

const ENUM_SETTING_CODEC: SettingCodec = {
  decode: (saved, definition) => {
    const allowedValues = getAllowedValues(definition);
    return allowedValues.includes(saved) ? saved : definition.default as string;
  },
  encode: (value, definition, logger) => {
    const normalized = String(value);
    const allowedValues = getAllowedValues(definition);
    if (!allowedValues.includes(normalized)) {
      logger.warn(`Invalid ${definition.name}: ${normalized}. Valid values: ${allowedValues.join(', ')}`);
      return { ok: false };
    }
    return { ok: true, value: normalized };
  }
};

const STRING_SETTING_CODEC: SettingCodec = {
  decode: (saved) => saved,
  encode: (value) => ({ ok: true, value: String(value) })
};

const SETTING_CODECS: Record<string, SettingCodec> = {
  boolean: BOOLEAN_SETTING_CODEC,
  number: NUMBER_SETTING_CODEC,
  enum: ENUM_SETTING_CODEC,
  string: STRING_SETTING_CODEC
};

function getSettingCodec(definition: SettingDefinition): SettingCodec {
  return SETTING_CODECS[definition.type] ?? STRING_SETTING_CODEC;
}

@injectable()
class SettingsService extends BaseService {
  private readonly settingDefinitions: readonly SettingDefinition[];
  private readonly settingDefinitionMap: Map<string, SettingDefinition>;

  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: SettingsEventBus,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike,
    @inject(TOKENS.storageService) private readonly storageService: StorageServiceLike
  ) {
    super({ loggerFactory, eventBus }, 'SettingsService');

    this.settingDefinitions = SettingsDefinitions.definitions;
    this.settingDefinitionMap = createDefinitionMap(this.settingDefinitions);
  }

  async initialize(): Promise<void> {
    try {
      const preferences = this.loadAllPreferences();

      for (const { name, event } of getStartupPreferenceEventDefinitions()) {
        this.eventBus.publish(event, preferences[name]);
      }

      this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED, preferences);

      this.logger.info('Preferences loaded');
    } catch (error) {
      this.logger.error('Error loading preferences:', error);
    }
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
    if (isPromiseLike<SettingValue>(value)) {
      throw new Error(`Setting requires asynchronous access: ${name}`);
    }
    return value;
  }

  _readStoredSetting(definition: SettingDefinition): SettingValue {
    const saved = this.storageService.getItem(definition.storageKey);
    if (saved === null || saved === undefined) {
      return definition.default as SettingValue;
    }

    return getSettingCodec(definition).decode(saved, definition);
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

  _normalizeSettingValue(definition: SettingDefinition, value: unknown): SettingEncodeResult {
    return getSettingCodec(definition).encode(value, definition, this.logger);
  }

  _normalizeBoolean(value: unknown): boolean {
    return normalizeBooleanValue(value);
  }

  _usesLoginItemAPI(definition: SettingDefinition): boolean {
    return definition.name === 'launchOnLogin'
      && (definition as SettingDefinition & { externalSource?: string }).externalSource === 'window.loginItemAPI';
  }

  async _readLoginItemSetting(definition: SettingDefinition): Promise<boolean> {
    try {
      const result = await trpcClient.loginItem.get.query();
      this.storageService.setItem(definition.storageKey, result.enabled.toString());
      return result.enabled;
    } catch {
      this.logger.warn('Failed to query login item state from main process');
    }

    return this._readStoredSetting(definition) as boolean;
  }

  async _writeLoginItemSetting(definition: SettingDefinition, value: unknown): Promise<boolean> {
    const enabled = this._normalizeBoolean(value);
    try {
      await trpcClient.loginItem.set.mutate(enabled);
    } catch (error) {
      this.logger.error('Failed to set login item state in main process', error);
      return false;
    }

    const stored = this.storageService.setItem(definition.storageKey, enabled.toString());
    if (stored) {
      this.logger.debug(`Setting ${definition.name} set to ${enabled}`);
    }
    return stored;
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
