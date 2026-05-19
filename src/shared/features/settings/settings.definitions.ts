import definitions from './settings.definitions.json';

export type SettingsDefinitionsManifest = typeof definitions;
export type SettingsDefinition = SettingsDefinitionsManifest['definitions'][number];

export const SettingsDefinitions = definitions;

