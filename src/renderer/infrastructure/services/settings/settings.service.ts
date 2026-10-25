
import { BaseService } from '@platform/core';
import { EventChannels, type TypedEventBusLike } from '@platform/events';
import { SettingsDefinitions, getStartupPreferenceEventDefinitions, type SettingsDefinition, type SettingName, type StoredSettingName, type SettingValues, type SettingsAccess } from '@renderer/lib/settings.definitions.js';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import type { LoggerFactoryLike, LoggerLike, StorageServiceLike } from '@platform/core';

type SettingDefinition = SettingsDefinition;
type SettingDefaultValue = string | number | boolean;
type SettingValue = SettingDefaultValue;
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
  const validation = definition.validation;
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
    const allowedValues = (definition.allowedValues ?? []);
    return allowedValues.includes(saved) ? saved : definition.default as string;
  },
  encode: (value, definition, logger) => {
    const normalized = String(value);
    const allowedValues = (definition.allowedValues ?? []);
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

const SETTING_CODECS: Record<SettingDefinition['type'], SettingCodec> = {
  boolean: BOOLEAN_SETTING_CODEC,
  number: NUMBER_SETTING_CODEC,
  enum: ENUM_SETTING_CODEC,
  string: STRING_SETTING_CODEC
};

function getSettingCodec(definition: SettingDefinition): SettingCodec {
  return SETTING_CODECS[definition.type];
}

type SettingsServiceDependencies = {
  eventBus: Pick<TypedEventBusLike, 'publish'>;
  loggerFactory: LoggerFactoryLike;
  storageService: StorageServiceLike;
};

class SettingsService extends BaseService implements SettingsAccess {
  private readonly settingDefinitionMap: Map<string, SettingDefinition>;

  private readonly eventBus: Pick<TypedEventBusLike, 'publish'>;
  private readonly storageService: StorageServiceLike;

  constructor({ eventBus, loggerFactory, storageService }: SettingsServiceDependencies) {
    super({ loggerFactory }, 'SettingsService');
    this.eventBus = eventBus;
    this.storageService = storageService;

    this.settingDefinitionMap = new Map(SettingsDefinitions.definitions.map((definition) => [definition.name, definition]));
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

  getSetting<K extends StoredSettingName>(name: K): SettingValues[K] {
    const definition = this._getSettingDefinition(name);
    if (definition.externalSource) throw new Error(`Setting requires asynchronous access: ${name}`);
    return this._readStoredSetting(definition) as SettingValues[K];
  }

  setSetting<K extends StoredSettingName>(name: K, value: SettingValues[K]): boolean {
    const definition = this._getSettingDefinition(name);
    if (definition.externalSource) throw new Error(`Setting requires asynchronous access: ${name}`);
    return this._writeStoredSetting(definition, value);
  }

  _readStoredSetting(definition: SettingDefinition): SettingValue {
    const saved = this.storageService.getItem(definition.storageKey);
    if (saved === null || saved === undefined) {
      return definition.default as SettingValue;
    }

    return getSettingCodec(definition).decode(saved, definition);
  }

  _writeStoredSetting(definition: SettingDefinition, value: unknown): boolean {
    const normalized = getSettingCodec(definition).encode(value, definition, this.logger);
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

  async getLaunchOnLogin(): Promise<boolean> {
    const definition = this._getSettingDefinition('launchOnLogin');
    try {
      const result = await trpcClient.loginItem.get.query();
      this.storageService.setItem(definition.storageKey, result.enabled.toString());
      return result.enabled;
    } catch {
      this.logger.warn('Failed to query login item state from main process');
    }

    return this._readStoredSetting(definition) as boolean;
  }

  async setLaunchOnLogin(value: boolean): Promise<boolean> {
    const definition = this._getSettingDefinition('launchOnLogin');
    const enabled = normalizeBooleanValue(value);
    try {
      await trpcClient.loginItem.set.mutate({ enabled });
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

  _getSettingDefinition(name: SettingName): SettingDefinition {
    const definition = this.settingDefinitionMap.get(name);
    if (!definition) {
      throw new Error(`Unknown setting: ${name}`);
    }
    return definition;
  }

  loadAllPreferences() {
    const preferences = Object.fromEntries(
      SettingsDefinitions.loadAllPreferencesShape.map((name) => [name, this.getSetting(name)])
    );

    const summary = SettingsDefinitions.loadAllPreferencesShape
      .map((name: string) => `${name}: ${String(preferences[name])}`)
      .join(', ');
    this.logger.info(`Loaded preferences - ${summary}`);

    return preferences;
  }
}

export { SettingsService };
