import { describe, expect, it } from 'vitest';
import {
  NotesStorageKeys,
  SETTINGS_STORAGE_KEYS,
  PROTECTED_STORAGE_KEYS
} from '@shared/config/storage-keys.config';
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions';

const expectedSettingsKeys = SettingsDefinitions.definitions.map((definition) => definition.storageKey);
const expectedProtectedKeys = [NotesStorageKeys.USER_NOTES, ...expectedSettingsKeys];

describe('storage-keys.config', () => {
  it('exposes the notes storage key', () => {
    expect(NotesStorageKeys.USER_NOTES).toBe('userNotes');
  });

  describe('SETTINGS_STORAGE_KEYS proxy', () => {
    it('iterates the settings storage keys derived from the manifest', () => {
      expect([...SETTINGS_STORAGE_KEYS]).toEqual(expectedSettingsKeys);
    });

    it('exposes length and index access (non-function members)', () => {
      expect(SETTINGS_STORAGE_KEYS.length).toBe(expectedSettingsKeys.length);
      expect(SETTINGS_STORAGE_KEYS[0]).toBe(expectedSettingsKeys[0]);
    });

    it('binds array methods (function members)', () => {
      expect(SETTINGS_STORAGE_KEYS.includes(expectedSettingsKeys[0])).toBe(true);
      expect(SETTINGS_STORAGE_KEYS.indexOf('does-not-exist')).toBe(-1);
    });

    it('reflects own keys and property descriptors', () => {
      expect(Object.keys(SETTINGS_STORAGE_KEYS)).toEqual(expectedSettingsKeys.map((_, index) => String(index)));
      expect(Object.getOwnPropertyDescriptor(SETTINGS_STORAGE_KEYS, '0')?.value).toBe(expectedSettingsKeys[0]);
    });

    it('memoizes the computed keys across accesses', () => {
      expect([...SETTINGS_STORAGE_KEYS]).toEqual([...SETTINGS_STORAGE_KEYS]);
    });
  });

  describe('PROTECTED_STORAGE_KEYS proxy', () => {
    it('lists the notes key followed by every settings key', () => {
      expect([...PROTECTED_STORAGE_KEYS]).toEqual(expectedProtectedKeys);
    });

    it('exposes length and index access', () => {
      expect(PROTECTED_STORAGE_KEYS.length).toBe(expectedProtectedKeys.length);
      expect(PROTECTED_STORAGE_KEYS[0]).toBe('userNotes');
    });

    it('binds array methods', () => {
      expect(PROTECTED_STORAGE_KEYS.includes('userNotes')).toBe(true);
    });

    it('reflects own keys and property descriptors', () => {
      expect(Object.keys(PROTECTED_STORAGE_KEYS)).toEqual(expectedProtectedKeys.map((_, index) => String(index)));
      expect(Object.getOwnPropertyDescriptor(PROTECTED_STORAGE_KEYS, '0')?.value).toBe('userNotes');
    });

    it('memoizes across accesses', () => {
      expect([...PROTECTED_STORAGE_KEYS]).toEqual([...PROTECTED_STORAGE_KEYS]);
    });
  });
});
