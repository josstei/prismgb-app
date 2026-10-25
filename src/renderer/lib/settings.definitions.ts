import { PRESET_POLICY } from '@platform/gpu';
import { TRANSCODE_CONFIG } from '@platform/transcode';
import type { TranscodeFormat } from '@platform/ipc';
import { EventChannels, type EventPayloadMap } from '@platform/events';

type SettingEvent<T> = { [K in keyof EventPayloadMap]: EventPayloadMap[K] extends T ? K : never }[keyof EventPayloadMap];
export interface SettingsControlUi {
  readonly order: number;
  readonly controlName: string;
  readonly controlId: string;
  readonly controlType: 'checkbox' | 'listbox';
  readonly label: string;
  readonly title: string;
  readonly hintId?: string;
  readonly hint?: string;
  readonly labelId?: string;
  readonly menuId?: string;
  readonly optionLabelFormat?: 'mediaFormat';
  readonly e2eToggle?: boolean;
}
interface DefinitionMetadata {
  readonly name: string;
  readonly storageKey: string;
  readonly startupPreference?: boolean;
  readonly protected?: boolean;
  readonly externalSource?: 'loginItem';
  readonly ui?: SettingsControlUi;
  readonly validation?: { readonly min?: number; readonly max?: number; readonly clamp?: boolean };
  readonly allowedValues?: readonly string[];
}
type DefinitionInput = DefinitionMetadata & (
  | { readonly type: 'boolean'; readonly default: boolean; readonly event?: SettingEvent<boolean> }
  | { readonly type: 'number'; readonly default: number; readonly event?: SettingEvent<number> }
  | { readonly type: 'string' | 'enum'; readonly default: string; readonly event?: SettingEvent<string> }
);

// The source of setting defaults, persistence keys, controls and event contracts.
const definitions = [
  {
    name: 'gameVolume',
    storageKey: 'gameVolume',
    type: 'number',
    default: 70,
    validation: {
      min: 0,
      max: 100,
      clamp: true
    },
    event: EventChannels.SETTINGS.VOLUME_CHANGED,
    startupPreference: true
  },
  {
    name: 'statusStripVisible',
    storageKey: 'statusStripVisible',
    type: 'boolean',
    default: false,
    startupPreference: true,
    ui: {
      order: 20,
      controlName: 'statusStrip',
      controlId: 'settingStatusStrip',
      controlType: 'checkbox',
      label: 'status strip',
      title: 'Show Status Bar'
    }
  },
  {
    name: 'renderPreset',
    storageKey: 'renderPreset',
    type: 'string',
    event: EventChannels.SETTINGS.RENDER_PRESET_CHANGED,
    default: PRESET_POLICY.rendererDefaultId
  },
  {
    name: 'globalBrightness',
    storageKey: 'globalBrightness',
    type: 'number',
    default: 1,
    validation: {
      min: 0.5,
      max: 1.5,
      clamp: true
    },
    event: EventChannels.SETTINGS.BRIGHTNESS_CHANGED
  },
  {
    name: 'performanceMode',
    storageKey: 'performanceMode',
    type: 'boolean',
    default: false,
    startupPreference: true,
    event: EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
    ui: {
      order: 60,
      controlName: 'animationSaver',
      controlId: 'settingAnimationSaver',
      controlType: 'checkbox',
      label: 'performance mode',
      title: 'Performance mode',
      hintId: 'animationSaverHint',
      hint: 'Use basic renderer for lower CPU.'
    }
  },
  {
    name: 'fullscreenOnStartup',
    storageKey: 'fullscreenOnStartup',
    type: 'boolean',
    default: false,
    ui: {
      order: 30,
      controlName: 'fullscreenOnStartup',
      controlId: 'settingFullscreenOnStartup',
      controlType: 'checkbox',
      label: 'fullscreen on startup',
      title: 'Fullscreen on startup'
    }
  },
  {
    name: 'minimalistFullscreen',
    storageKey: 'minimalistFullscreen',
    type: 'boolean',
    default: false,
    startupPreference: true,
    event: EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
    ui: {
      order: 50,
      controlName: 'minimalistFullscreen',
      controlId: 'settingMinimalistFullscreen',
      controlType: 'checkbox',
      label: 'minimalist fullscreen',
      title: 'Minimalist fullscreen',
      hintId: 'minimalistFullscreenHint',
      hint: 'Black background while streaming.'
    }
  },
  {
    name: 'autoStreamOnConnect',
    storageKey: 'autoStreamOnConnect',
    type: 'boolean',
    default: false,
    ui: {
      order: 40,
      controlName: 'autoStreamOnConnect',
      controlId: 'settingAutoStreamOnConnect',
      controlType: 'checkbox',
      label: 'auto-stream',
      title: 'Auto-start stream',
      hintId: 'autoStreamHint',
      hint: 'Automatically start streaming when device connects.'
    }
  },
  {
    name: 'recordingFormat',
    storageKey: 'recordingFormat',
    type: 'enum',
    default: 'webm',
    ui: {
      order: 70,
      controlName: 'recordingFormat',
      controlId: 'settingRecordingFormat',
      controlType: 'listbox',
      label: 'recording format',
      title: 'Recording format',
      hintId: 'recordingFormatHint',
      hint: 'Output format for video recordings.',
      labelId: 'recordingFormatLabel',
      menuId: 'recordingFormatMenu',
      optionLabelFormat: 'mediaFormat',
      e2eToggle: false
    },
    allowedValues: Object.keys(TRANSCODE_CONFIG.formats) as TranscodeFormat[]
  },
  {
    name: 'launchOnLogin',
    storageKey: 'launchOnLogin',
    type: 'boolean',
    default: false,
    protected: true,
    externalSource: 'loginItem',
    ui: {
      order: 10,
      controlName: 'launchOnLogin',
      controlId: 'settingLaunchOnLogin',
      controlType: 'checkbox',
      label: 'launch on startup',
      title: 'Launch on startup',
      hintId: 'launchOnLoginHint',
      hint: 'Start PrismGB when your computer turns on.',
      e2eToggle: false
    }
  }
] as const satisfies readonly DefinitionInput[];

export const SettingsControlRefs = Object.freeze(definitions.flatMap((definition) => {
  if (!('ui' in definition)) return [];
  const { ui } = definition;
  return [ui.controlId, ...('labelId' in ui ? [ui.labelId, ui.menuId] : [])];
}));

export type SettingName = typeof definitions[number]['name'];
export type StoredSettingName = Exclude<SettingName, 'launchOnLogin'>;
export type SettingValues = {
  [D in typeof definitions[number] as D['name']]: D['type'] extends 'boolean' ? boolean
    : D['type'] extends 'number' ? number : D['name'] extends 'recordingFormat' ? TranscodeFormat : string;
};
export interface SettingsAccess {
  getSetting<K extends StoredSettingName>(name: K): SettingValues[K];
  setSetting<K extends StoredSettingName>(name: K, value: SettingValues[K]): boolean;
  getLaunchOnLogin(): Promise<boolean>;
  setLaunchOnLogin(enabled: boolean): Promise<boolean>;
}
export type SettingsDefinition = DefinitionInput & { readonly name: SettingName };
export type SettingsControlDefinition = SettingsDefinition & { readonly ui: SettingsControlUi };
export type SettingsListboxDefinition = SettingsControlDefinition & {
  readonly default: string;
  readonly allowedValues: readonly string[];
  readonly ui: SettingsControlUi & { readonly controlType: 'listbox'; readonly labelId: string; readonly menuId: string };
};
export type SettingsListboxOption = { value: string; label: string; active: boolean };

const allDefinitions: readonly SettingsDefinition[] = Object.freeze(definitions.map((definition) => {
  if ('ui' in definition) Object.freeze(definition.ui);
  if ('validation' in definition) Object.freeze(definition.validation);
  if ('allowedValues' in definition) Object.freeze(definition.allowedValues);
  return Object.freeze(definition);
}));
const startupPreferenceDefinitions = Object.freeze(allDefinitions.filter((definition) => definition.startupPreference));
const startupPreferenceEventDefinitions = Object.freeze(startupPreferenceDefinitions.filter(
  (definition): definition is SettingsDefinition & { event: keyof EventPayloadMap } => Boolean(definition.event)
));

export const SettingsDefinitions = Object.freeze({
  definitions: allDefinitions,
  startupPreferenceDefinitions,
  startupPreferenceEventDefinitions,
  loadAllPreferencesShape: Object.freeze(startupPreferenceDefinitions.map((definition) => definition.name as StoredSettingName))
});

export function hasSettingsControl(definition: SettingsDefinition): definition is SettingsControlDefinition {
  return definition.ui !== undefined;
}
export function hasSettingsListboxControl(definition: SettingsDefinition): definition is SettingsListboxDefinition {
  return definition.ui?.controlType === 'listbox';
}
export function hasExternalSource(definition: SettingsDefinition): boolean {
  return definition.externalSource !== undefined;
}
export function getSettingsUiDefinitions(): SettingsControlDefinition[] {
  return allDefinitions.filter(hasSettingsControl).sort((a, b) => a.ui.order - b.ui.order);
}
export function getBooleanSettingsUiDefinitions(): SettingsControlDefinition[] {
  return getSettingsUiDefinitions().filter((definition) => definition.type === 'boolean' && definition.ui.controlType === 'checkbox');
}
export function getListboxSettingsUiDefinitions(): SettingsListboxDefinition[] {
  return allDefinitions.filter(hasSettingsListboxControl);
}
export function getSettingsListboxOptions(definition: SettingsListboxDefinition): SettingsListboxOption[] {
  return definition.allowedValues.map((value) => ({
    value,
    label: definition.ui.optionLabelFormat === 'mediaFormat' ? (value === 'webm' ? 'WebM' : value.toUpperCase()) : value,
    active: value === definition.default
  }));
}
export function getStartupPreferenceEventDefinitions() {
  return startupPreferenceEventDefinitions;
}
