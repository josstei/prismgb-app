import definitions from './settings.definitions.json';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { PRESET_POLICY } from '@prismgb/gpu';

type RawSettingsDefinitionsManifest = typeof definitions;
type RawSettingsDefinition = RawSettingsDefinitionsManifest['definitions'][number];
type ResolvedSettingsDefinition = Omit<RawSettingsDefinition, 'default'> & {
  default: string | number | boolean;
  allowedValues?: string[];
};
const ALLOWED_VALUE_SOURCES = {
  'TRANSCODE_CONFIG.formats': () => Object.keys(TRANSCODE_CONFIG.formats)
} as const;
const DEFAULT_VALUE_SOURCES = {
  'PRESET_POLICY.rendererDefaultId': () => PRESET_POLICY.rendererDefaultId
} as const;

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

const resolvedDefinitions = Object.freeze(definitions.definitions.map(resolveSettingDefinition));
const loadAllPreferencesShape = Object.freeze(resolvedDefinitions.filter(shouldLoadAtStartup).map((definition) => definition.name));

export const SettingsDefinitions = Object.freeze({ ...definitions, definitions: resolvedDefinitions, loadAllPreferencesShape });

export type SettingsDefinitionsManifest = typeof SettingsDefinitions;
export type SettingsDefinition = SettingsDefinitionsManifest['definitions'][number];
export type SettingsControlUi = NonNullable<SettingsDefinition['ui']> & { controlId: string; controlType: string; labelId?: string; menuId?: string; optionLabelFormat?: string };
export type SettingsControlDefinition = SettingsDefinition & { ui: SettingsControlUi };
export type SettingsControlRef = SettingsControlUi['controlId'] | NonNullable<SettingsControlUi['labelId']> | NonNullable<SettingsControlUi['menuId']>;
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
    Array.isArray(definition.allowedValues) &&
    definition.ui.labelId &&
    definition.ui.menuId
  );
}

export function hasExternalSource(definition: SettingsDefinition): boolean {
  return 'externalSource' in definition && Boolean(definition.externalSource);
}

export function getSettingsUiDefinitions(): SettingsControlDefinition[] {
  return SettingsDefinitions.definitions.filter(hasSettingsControl).sort((a, b) => (a.ui.order ?? 0) - (b.ui.order ?? 0));
}

export function getBooleanSettingsUiDefinitions(): SettingsControlDefinition[] {
  return getSettingsUiDefinitions().filter((definition) => definition.type === 'boolean' && definition.ui.controlType === 'checkbox');
}

export function getListboxSettingsUiDefinitions(): SettingsListboxDefinition[] {
  return getSettingsUiDefinitions().filter(hasSettingsListboxControl);
}

export function getSettingsControlRefs(): SettingsControlRef[] {
  return getSettingsUiDefinitions().flatMap((definition) => (
    hasSettingsListboxControl(definition)
      ? [definition.ui.controlId, definition.ui.labelId, definition.ui.menuId]
      : [definition.ui.controlId]
  ));
}

export function getSettingsListboxOptions(definition: SettingsListboxDefinition): SettingsListboxOption[] {
  const formatter = SETTINGS_OPTION_LABEL_FORMATTERS[definition.ui.optionLabelFormat as keyof typeof SETTINGS_OPTION_LABEL_FORMATTERS];
  return definition.allowedValues.map((value) => ({
    value,
    label: formatter?.(value) ?? value,
    active: value === definition.default
  }));
}
