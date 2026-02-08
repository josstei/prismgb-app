/**
 * Storage Key Constants
 *
 * Shared storage keys used by non-UI services and presentation.
 */
export const SettingsStorageKeys = {
  VOLUME: 'gameVolume',
  STATUS_STRIP: 'statusStripVisible',
  RENDER_PRESET: 'renderPreset',
  GLOBAL_BRIGHTNESS: 'globalBrightness',
  PERFORMANCE_MODE: 'performanceMode',
  FULLSCREEN_ON_STARTUP: 'fullscreenOnStartup',
  MINIMALIST_FULLSCREEN: 'minimalistFullscreen',
  AUTO_STREAM_ON_CONNECT: 'autoStreamOnConnect',
  RECORDING_FORMAT: 'recordingFormat',
  LAUNCH_ON_LOGIN: 'launchOnLogin'
};

export const NotesStorageKeys = {
  USER_NOTES: 'userNotes'
};

const CRITICAL_STORAGE_KEYS = [
  NotesStorageKeys.USER_NOTES
];

export const PROTECTED_STORAGE_KEYS = [
  ...CRITICAL_STORAGE_KEYS,
  SettingsStorageKeys.VOLUME,
  SettingsStorageKeys.STATUS_STRIP,
  SettingsStorageKeys.RENDER_PRESET,
  SettingsStorageKeys.GLOBAL_BRIGHTNESS,
  SettingsStorageKeys.PERFORMANCE_MODE,
  SettingsStorageKeys.FULLSCREEN_ON_STARTUP,
  SettingsStorageKeys.MINIMALIST_FULLSCREEN,
  SettingsStorageKeys.AUTO_STREAM_ON_CONNECT,
  SettingsStorageKeys.RECORDING_FORMAT,
  SettingsStorageKeys.LAUNCH_ON_LOGIN
];
