import { describe, expect, it } from 'vitest';
import {
  NotesStorageKeys,
  PROTECTED_STORAGE_KEYS
} from '@renderer/lib/storage-keys.config';
import { SettingsDefinitions } from '@renderer/lib/settings.definitions';

const expectedSettingsKeys = SettingsDefinitions.definitions.map((definition) => definition.storageKey);
const expectedProtectedKeys = [NotesStorageKeys.USER_NOTES, ...expectedSettingsKeys];

describe('storage-keys.config', () => {
  it('exposes the notes storage key', () => {
    expect(NotesStorageKeys.USER_NOTES).toBe('userNotes');
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
