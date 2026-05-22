import definitions from './settings.definitions.json';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';

type RawSettingsDefinitionsManifest = typeof definitions;
type RawSettingsDefinition = RawSettingsDefinitionsManifest['definitions'][number];

const ALLOWED_VALUE_SOURCES = {
  'TRANSCODE_CONFIG.formats': () => Object.keys(TRANSCODE_CONFIG.formats)
} as const;

type AllowedValueSource = keyof typeof ALLOWED_VALUE_SOURCES;

function resolveSettingDefinition(definition: RawSettingsDefinition) {
  if (!('allowedValuesSource' in definition)) {
    return definition;
  }

  const source = definition.allowedValuesSource as AllowedValueSource;
  const resolveAllowedValues = ALLOWED_VALUE_SOURCES[source];
  if (!resolveAllowedValues) {
    throw new Error(`Unknown settings allowedValuesSource: ${definition.allowedValuesSource}`);
  }

  return {
    ...definition,
    allowedValues: resolveAllowedValues()
  };
}

export const SettingsDefinitions = Object.freeze({
  ...definitions,
  definitions: Object.freeze(definitions.definitions.map(resolveSettingDefinition))
});

export type SettingsDefinitionsManifest = typeof SettingsDefinitions;
export type SettingsDefinition = SettingsDefinitionsManifest['definitions'][number];
