/**
 * Storage Key Constants
 *
 * Shared storage keys used by non-UI services and presentation.
 */
import { SettingsDefinitions } from '@shared/features/settings/settings.definitions';

export const SETTINGS_STORAGE_KEYS = SettingsDefinitions.definitions.map(
  (definition) => definition.storageKey
);

export const NotesStorageKeys = {
  USER_NOTES: 'userNotes'
};

const CRITICAL_STORAGE_KEYS = [
  NotesStorageKeys.USER_NOTES
];

export const PROTECTED_STORAGE_KEYS = [
  ...CRITICAL_STORAGE_KEYS,
  ...SETTINGS_STORAGE_KEYS
];
