import { describe, expect, it } from 'vitest';
import {
  SettingsDefinitions,
  hasSettingsControl,
  hasSettingsListboxControl,
  hasExternalSource,
  getSettingsUiDefinitions,
  getBooleanSettingsUiDefinitions,
  getListboxSettingsUiDefinitions,
  getSettingsListboxOptions
} from '@renderer/lib/settings.definitions';
import type { SettingsListboxDefinition } from '@renderer/lib/settings.definitions';

function definitionNamed(name: string) {
  const definition = SettingsDefinitions.definitions.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`Test fixture expects a settings definition named "${name}"`);
  }
  return definition;
}

describe('SettingsDefinitions manifest', () => {
  it('exposes immutable setting definitions', () => {
    expect(Object.isFrozen(SettingsDefinitions)).toBe(true);
    expect(Object.isFrozen(SettingsDefinitions.definitions)).toBe(true);
    expect(Array.isArray(SettingsDefinitions.definitions)).toBe(true);
    expect(Array.isArray(SettingsDefinitions.startupPreferenceDefinitions)).toBe(true);
  });

  it('marks only synchronously-readable definitions as startup preferences', () => {
    for (const definition of SettingsDefinitions.startupPreferenceDefinitions) {
      expect(definition.startupPreference).toBe(true);
      expect('externalSource' in definition).toBe(false);
    }
  });

});

describe('settings definition predicates', () => {
  it('classifies UI controls', () => {
    expect(hasSettingsControl(definitionNamed('statusStripVisible'))).toBe(true);
    expect(hasSettingsControl(definitionNamed('gameVolume'))).toBe(false);
  });

  it('classifies listbox controls', () => {
    expect(hasSettingsListboxControl(definitionNamed('recordingFormat'))).toBe(true);
    expect(hasSettingsListboxControl(definitionNamed('statusStripVisible'))).toBe(false);
  });

  it('detects external sources', () => {
    expect(hasExternalSource(definitionNamed('launchOnLogin'))).toBe(true);
    expect(hasExternalSource(definitionNamed('gameVolume'))).toBe(false);
  });

  it('returns UI definitions ordered by ui.order', () => {
    const orders = getSettingsUiDefinitions().map((definition) => definition.ui.order ?? 0);
    expect([...orders]).toEqual([...orders].sort((a, b) => a - b));
    expect(getBooleanSettingsUiDefinitions().every((definition) => definition.type === 'boolean')).toBe(true);
    expect(getListboxSettingsUiDefinitions().every((definition) => definition.ui.controlType === 'listbox')).toBe(true);
  });
});

describe('getSettingsListboxOptions', () => {
  it('applies the named formatter for known formats', () => {
    const recordingFormat = getListboxSettingsUiDefinitions().find((definition) => definition.name === 'recordingFormat');
    expect(recordingFormat).toBeDefined();
    const options = getSettingsListboxOptions(recordingFormat as SettingsListboxDefinition);
    expect(options.map((option) => option.label)).toEqual(['WebM', 'MP4', 'MOV']);
    expect(options.find((option) => option.value === 'webm')?.active).toBe(true);
  });

  it('falls back to the raw value when the formatter is unknown', () => {
    const synthetic = {
      name: 'syntheticListbox',
      default: 'alpha',
      allowedValues: ['alpha', 'beta'],
      ui: { controlId: 'c', controlType: 'listbox', labelId: 'l', menuId: 'm', optionLabelFormat: 'noSuchFormatter' }
    } as unknown as SettingsListboxDefinition;
    const options = getSettingsListboxOptions(synthetic);
    expect(options).toEqual([
      { value: 'alpha', label: 'alpha', active: true },
      { value: 'beta', label: 'beta', active: false }
    ]);
  });
});
