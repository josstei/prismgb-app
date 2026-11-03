import { SettingsDefinitions } from '@renderer/lib/settings.definitions';
import { NotesStorageKeys } from '@platform/notes';

export { NotesStorageKeys };

export const PROTECTED_STORAGE_KEYS = Object.freeze([
  NotesStorageKeys.USER_NOTES,
  ...SettingsDefinitions.definitions.map((definition) => definition.storageKey)
]);
