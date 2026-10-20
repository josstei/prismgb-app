import { SettingsDefinitions } from '@renderer/lib/settings.definitions';

export const NOTES_STORAGE_KEY = 'userNotes';

let cachedSettingsKeys: string[] | null = null;
function getSettingsKeys(): string[] {
  if (!cachedSettingsKeys) {
    cachedSettingsKeys = SettingsDefinitions.definitions.map(
      (definition: any) => definition.storageKey
    );
  }
  return cachedSettingsKeys!;
}

let cachedProtectedKeys: string[] | null = null;
function getProtectedKeys(): string[] {
  if (!cachedProtectedKeys) {
    cachedProtectedKeys = [
      NOTES_STORAGE_KEY,
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
