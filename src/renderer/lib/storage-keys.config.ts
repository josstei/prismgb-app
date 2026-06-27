/**
 * Storage Key Constants
 *
 * Shared storage keys used by non-UI services and presentation.
 */
import { SettingsDefinitions } from '@renderer/lib/settings.definitions';

export const NotesStorageKeys = {
  USER_NOTES: 'userNotes'
};

let cachedSettingsKeys: string[] | null = null;
function getSettingsKeys(): string[] {
  if (!cachedSettingsKeys) {
    cachedSettingsKeys = SettingsDefinitions.definitions.map(
      (definition: any) => definition.storageKey
    );
  }
  return cachedSettingsKeys!;
}

export const SETTINGS_STORAGE_KEYS = new Proxy([] as string[], {
  get(target, prop) {
    const keys = getSettingsKeys();
    const value = Reflect.get(keys, prop);
    return typeof value === 'function' ? value.bind(keys) : value;
  },
  ownKeys() {
    return Reflect.ownKeys(getSettingsKeys());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getSettingsKeys(), prop);
  }
});

let cachedProtectedKeys: string[] | null = null;
function getProtectedKeys(): string[] {
  if (!cachedProtectedKeys) {
    cachedProtectedKeys = [
      NotesStorageKeys.USER_NOTES,
      ...getSettingsKeys()
    ];
  }
  return cachedProtectedKeys!;
}

export const PROTECTED_STORAGE_KEYS = new Proxy([] as string[], {
  get(target, prop) {
    const keys = getProtectedKeys();
    const value = Reflect.get(keys, prop);
    return typeof value === 'function' ? value.bind(keys) : value;
  },
  ownKeys() {
    return Reflect.ownKeys(getProtectedKeys());
  },
  getOwnPropertyDescriptor(target, prop) {
    return Reflect.getOwnPropertyDescriptor(getProtectedKeys(), prop);
  }
});
