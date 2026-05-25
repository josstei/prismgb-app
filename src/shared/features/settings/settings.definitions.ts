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
const loadAllPreferencesShape = Object.freeze(
  resolvedDefinitions
    .filter((definition) => shouldLoadAtStartup(definition))
    .map((definition) => definition.name)
);

export const SettingsDefinitions = Object.freeze({
  ...definitions,
  definitions: resolvedDefinitions,
  loadAllPreferencesShape
});

export type SettingsDefinitionsManifest = typeof SettingsDefinitions;
export type SettingsDefinition = SettingsDefinitionsManifest['definitions'][number];
