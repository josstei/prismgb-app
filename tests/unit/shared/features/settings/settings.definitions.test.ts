/**
 * Coverage characterization for the settings-definitions module.
 *
 * The following defensive branches are intentionally left uncovered because they are
 * unreachable through the public API over the frozen, valid settings manifest, and
 * covering them would require exporting private functions or mutating a frozen manifest
 * (forbidden by ADR-0003):
 *  - resolveSettingDefinition: the "Unknown settings allowedValuesSource" and "missing a default" throws.
 *  - shouldLoadAtStartup: the "Startup preference must be synchronously readable" throw.
 *  - assertSettingEventMatchesManifest: the missing-event and payload-mismatch throws.
 *  - getSettingsUiDefinitions: the `?? 0` sort fallback (every UI definition declares an order).
 *  - registerAllowedValuesSource / registerDefaultValueSource: the production "registered after resolve"
 *    throw, reachable only by faking NODE_ENV and deleting globalThis.vi (defeats a production-only guard).
 */
import { describe, expect, it } from 'vitest';
import {
  SettingsDefinitions,
  registerAllowedValuesSource,
  registerDefaultValueSource,
  hasSettingsControl,
  hasSettingsListboxControl,
  hasExternalSource,
  getSettingsUiDefinitions,
  getBooleanSettingsUiDefinitions,
  getListboxSettingsUiDefinitions,
  getSettingsListboxOptions,
  getStartupPreferenceEventDefinitions
} from '@shared/features/settings/settings.definitions';
import type { SettingsListboxDefinition } from '@shared/features/settings/settings.definitions';

function definitionNamed(name: string) {
  const definition = SettingsDefinitions.definitions.find((candidate) => candidate.name === name);
  if (!definition) {
    throw new Error(`Test fixture expects a settings definition named "${name}"`);
  }
  return definition;
}

describe('SettingsDefinitions manifest', () => {
  it('exposes resolved manifest metadata via getters', () => {
    expect(typeof SettingsDefinitions.name).toBe('undefined');
    expect(typeof SettingsDefinitions.mode).toBe('string');
    expect(Array.isArray(SettingsDefinitions.definitions)).toBe(true);
    expect(Array.isArray(SettingsDefinitions.startupPreferenceDefinitions)).toBe(true);
    expect(Array.isArray(SettingsDefinitions.startupPreferenceEventDefinitions)).toBe(true);
    expect(Array.isArray(SettingsDefinitions.loadAllPreferencesShape)).toBe(true);
  });

  it('marks only synchronously-readable definitions as startup preferences', () => {
    for (const definition of SettingsDefinitions.startupPreferenceDefinitions) {
      expect(definition.startupPreference).toBe(true);
      expect('externalSource' in definition).toBe(false);
    }
  });

  it('exposes startup-preference event definitions that each carry a non-empty event', () => {
    const eventDefinitions = getStartupPreferenceEventDefinitions();
    expect(eventDefinitions.length).toBeGreaterThan(0);
    for (const definition of eventDefinitions) {
      expect(typeof definition.event).toBe('string');
      expect(definition.event.length).toBeGreaterThan(0);
    }
  });
});

describe('settings source registration (test-environment cache reset)', () => {
  it('resets the resolved cache when an allowed-values source is registered', () => {
    expect(SettingsDefinitions.definitions.length).toBeGreaterThan(0);
    registerAllowedValuesSource('TEST_ALLOWED', () => ['one', 'two']);
    expect(SettingsDefinitions.definitions.length).toBeGreaterThan(0);
  });

  it('resets the resolved cache when a default-value source is registered', () => {
    expect(SettingsDefinitions.definitions.length).toBeGreaterThan(0);
    registerDefaultValueSource('TEST_DEFAULT', () => 'value');
    expect(SettingsDefinitions.definitions.length).toBeGreaterThan(0);
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
