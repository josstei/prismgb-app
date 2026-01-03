/**
 * Storage Key Constants
 *
 * Centralized constants for localStorage keys.
 * Prevents key duplication and enables consistent protection during cleanup.
 */

/**
 * Storage keys for user settings
 */
export const SettingsStorageKeys = {
  VOLUME: 'gameVolume',
  STATUS_STRIP: 'statusStripVisible',
  RENDER_PRESET: 'renderPreset',
  GLOBAL_BRIGHTNESS: 'globalBrightness',
  PERFORMANCE_MODE: 'performanceMode',
  FULLSCREEN_ON_STARTUP: 'fullscreenOnStartup',
  MINIMALIST_FULLSCREEN: 'minimalistFullscreen'
};

/**
 * Storage keys for notes feature
 */
export const NotesStorageKeys = {
  USER_NOTES: 'userNotes'
};

/**
 * Storage keys that should be protected from cleanup when quota is exceeded.
 * These are critical user data that should NEVER be deleted during any cleanup activity.
 *
 * Priority order (highest to lowest):
 * 1. User-created content (notes) - irreplaceable user data
 * 2. User preferences - can be recreated but inconvenient to lose
 */
const CRITICAL_STORAGE_KEYS = [
  NotesStorageKeys.USER_NOTES  // User notes are irreplaceable content
];

/**
 * Storage keys that should be protected but can be cleared if absolutely necessary.
 * These are user preferences that affect UX but can be recreated.
 */
export const PROTECTED_STORAGE_KEYS = [
  // Critical - never delete
  ...CRITICAL_STORAGE_KEYS,

  // User preferences - protected but lower priority than user content
  SettingsStorageKeys.VOLUME,
  SettingsStorageKeys.STATUS_STRIP,
  SettingsStorageKeys.RENDER_PRESET,
  SettingsStorageKeys.GLOBAL_BRIGHTNESS,
  SettingsStorageKeys.PERFORMANCE_MODE,
  SettingsStorageKeys.FULLSCREEN_ON_STARTUP,
  SettingsStorageKeys.MINIMALIST_FULLSCREEN
];
