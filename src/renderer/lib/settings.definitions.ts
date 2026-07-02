import definitions from './settings.definitions.json';
import { getEventManifestScopeEvents } from '@platform/events';

type RawSettingsDefinitionsManifest = typeof definitions;
type RawSettingsDefinition = RawSettingsDefinitionsManifest['definitions'][number];
type ResolvedSettingsDefinition = Omit<RawSettingsDefinition, 'default'> & {
  default: string | number | boolean;
  allowedValues?: string[];
};
type ResolvedStartupPreferenceDefinition = ResolvedSettingsDefinition & { startupPreference: true };
type ResolvedStartupPreferenceEventDefinition = ResolvedStartupPreferenceDefinition & { event: string };
const SETTINGS_EVENT_PAYLOAD_BY_TYPE = { boolean: 'boolean', enum: 'string', number: 'number', string: 'string' } as const;
const rendererEventPayloadByValue = new Map(getEventManifestScopeEvents('renderer').map((event) => [event.value, event.payload] as const));

// DYNAMIC OPTION REGISTRY IMPLEMENTATION
const ALLOWED_VALUE_SOURCES: Record<string, () => string[]> = {
  'TRANSCODE_CONFIG.formats': () => ['webm', 'mp4', 'mov'] // Default fallback allowed formats
};
const DEFAULT_VALUE_SOURCES: Record<string, () => string | number | boolean> = {
  'PRESET_POLICY.rendererDefaultId': () => 'vibrant' // Default fallback preset
};

export function registerAllowedValuesSource(key: string, fn: () => string[]): void {
  if (resolvedCache) {
    if (process.env.NODE_ENV === 'test' || typeof (globalThis as any).vi !== 'undefined') {
      resolvedCache = null;
    } else {
      throw new Error(`Cannot register allowed values source "${key}" after SettingsDefinitions have been resolved.`);
    }
  }
  ALLOWED_VALUE_SOURCES[key] = fn;
}

export function registerDefaultValueSource(key: string, fn: () => string | number | boolean): void {
  if (resolvedCache) {
    if (process.env.NODE_ENV === 'test' || typeof (globalThis as any).vi !== 'undefined') {
      resolvedCache = null;
    } else {
      throw new Error(`Cannot register default value source "${key}" after SettingsDefinitions have been resolved.`);
    }
  }
  DEFAULT_VALUE_SOURCES[key] = fn;
}

function resolveSettingDefinition(definition: RawSettingsDefinition): ResolvedSettingsDefinition {
  const allowedValues = 'allowedValuesSource' in definition
    ? ALLOWED_VALUE_SOURCES[definition.allowedValuesSource as keyof typeof ALLOWED_VALUE_SOURCES]?.()
    : undefined;
  const defaultValue = 'default' in definition
    ? definition.default
    : DEFAULT_VALUE_SOURCES[definition.defaultSource as keyof typeof DEFAULT_VALUE_SOURCES]?.();
  if ('allowedValuesSource' in definition && !allowedValues) {
    throw new Error(`Unknown settings allowedValuesSource: ${definition.allowedValuesSource}`);
  }
  if (defaultValue === undefined) {
    throw new Error(`Setting definition is missing a default: ${definition.name}`);
  }

  return {
    ...definition,
    default: defaultValue,
    ...(allowedValues ? { allowedValues } : {})
  };
}

function shouldLoadAtStartup(definition: ResolvedSettingsDefinition): boolean {
  if (!('startupPreference' in definition) || definition.startupPreference !== true) {
    return false;
  }
  if ('externalSource' in definition) {
    throw new Error(`Startup preference must be synchronously readable: ${definition.name}`);
  }
  return true;
}

function assertSettingEventMatchesManifest(definition: ResolvedSettingsDefinition): void {
  if (!('event' in definition) || typeof definition.event !== 'string' || definition.event.length === 0) return;
  const actualPayload = rendererEventPayloadByValue.get(definition.event);
  const expectedPayload = SETTINGS_EVENT_PAYLOAD_BY_TYPE[definition.type as keyof typeof SETTINGS_EVENT_PAYLOAD_BY_TYPE];
  if (!actualPayload) throw new Error(`Settings event is missing from renderer event manifest: ${definition.name} -> ${definition.event}`);
  if (actualPayload !== expectedPayload) throw new Error(`Settings event payload mismatch for ${definition.name}: expected ${expectedPayload}, got ${actualPayload}`);
}

function hasStartupPreferenceEvent(definition: ResolvedSettingsDefinition): definition is ResolvedStartupPreferenceEventDefinition {
  return shouldLoadAtStartup(definition)
    && 'event' in definition
    && typeof definition.event === 'string'
    && definition.event.length > 0;
}

let resolvedCache: any = null;

function getResolved() {
  if (resolvedCache) return resolvedCache;

  const resolvedDefinitions = Object.freeze(definitions.definitions.map(resolveSettingDefinition));
  resolvedDefinitions.forEach(assertSettingEventMatchesManifest);
  const startupPreferenceDefinitions = Object.freeze(resolvedDefinitions.filter(shouldLoadAtStartup) as ResolvedStartupPreferenceDefinition[]);
  const startupPreferenceEventDefinitions = Object.freeze(resolvedDefinitions.filter(hasStartupPreferenceEvent));
  const loadAllPreferencesShape = Object.freeze(startupPreferenceDefinitions.map((definition) => definition.name));

  resolvedCache = Object.freeze({
    ...definitions,
    definitions: resolvedDefinitions,
    startupPreferenceDefinitions,
    startupPreferenceEventDefinitions,
    loadAllPreferencesShape
  });
  return resolvedCache;
}

export const SettingsDefinitions = {
  get name() { return getResolved().name; },
  get mode() { return getResolved().mode; },
  get definitions() { return getResolved().definitions; },
  get startupPreferenceDefinitions() { return getResolved().startupPreferenceDefinitions; },
  get startupPreferenceEventDefinitions() { return getResolved().startupPreferenceEventDefinitions; },
  get loadAllPreferencesShape() { return getResolved().loadAllPreferencesShape; }
};

export type SettingsDefinition = typeof definitions.definitions[number];
export type SettingsControlUi = NonNullable<SettingsDefinition['ui']> & { controlId: string; controlType: string; labelId?: string; menuId?: string; optionLabelFormat?: string };
export type SettingsControlDefinition = SettingsDefinition & { ui: SettingsControlUi };
export type SettingsListboxDefinition = SettingsControlDefinition & {
  default: string; allowedValues: string[];
  ui: SettingsControlUi & { controlType: 'listbox'; labelId: string; menuId: string };
};
export type SettingsListboxOption = { value: string; label: string; active: boolean };

const SETTINGS_OPTION_LABEL_FORMATTERS = {
  mediaFormat: (value: string) => value === 'webm' ? 'WebM' : value.toUpperCase()
} as const satisfies Record<string, (value: string) => string>;

export function hasSettingsControl(definition: SettingsDefinition): definition is SettingsControlDefinition {
  return Boolean(definition.ui?.controlId && definition.ui?.controlType);
}

export function hasSettingsListboxControl(definition: SettingsDefinition): definition is SettingsListboxDefinition {
  return hasSettingsControl(definition) && definition.ui.controlType === 'listbox' && Boolean(
    typeof definition.default === 'string' &&
    Array.isArray((definition as any).allowedValues) &&
    definition.ui.labelId &&
    definition.ui.menuId
  );
}

export function hasExternalSource(definition: SettingsDefinition): boolean {
  return 'externalSource' in definition && Boolean(definition.externalSource);
}

export function getSettingsUiDefinitions(): SettingsControlDefinition[] {
  return SettingsDefinitions.definitions.filter(hasSettingsControl).sort((a: any, b: any) => (a.ui.order ?? 0) - (b.ui.order ?? 0));
}

export function getBooleanSettingsUiDefinitions(): SettingsControlDefinition[] {
  return getSettingsUiDefinitions().filter((definition) => definition.type === 'boolean' && definition.ui.controlType === 'checkbox');
}

export function getListboxSettingsUiDefinitions(): SettingsListboxDefinition[] {
  return getSettingsUiDefinitions().filter(hasSettingsListboxControl);
}

export function getSettingsListboxOptions(definition: SettingsListboxDefinition): SettingsListboxOption[] {
  const formatter = SETTINGS_OPTION_LABEL_FORMATTERS[definition.ui.optionLabelFormat as keyof typeof SETTINGS_OPTION_LABEL_FORMATTERS];
  return definition.allowedValues.map((value) => ({
    value,
    label: formatter?.(value) ?? value,
    active: value === definition.default
  }));
}

export function getStartupPreferenceEventDefinitions(): readonly any[] {
  return SettingsDefinitions.startupPreferenceEventDefinitions;
}
