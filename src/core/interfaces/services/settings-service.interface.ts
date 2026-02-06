/**
 * Recording format options.
 */
export type RecordingFormat = 'webm' | 'mp4' | 'mov';

/**
 * Application settings.
 */
export interface AppSettings {
  volume: number;
  brightness: number;
  renderPreset: string;
  recordingFormat: RecordingFormat;
  performanceMode: boolean;
  cinematicMode: boolean;
  minimalistFullscreen: boolean;
}

/**
 * Interface for settings service.
 */
export interface ISettingsService {
  /**
   * Get a setting value.
   */
  get<K extends keyof AppSettings>(key: K): AppSettings[K];

  /**
   * Set a setting value.
   */
  set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;

  /**
   * Get all settings.
   */
  getAll(): AppSettings;

  /**
   * Reset all settings to defaults.
   */
  reset(): void;

  /**
   * Load settings from storage.
   */
  load(): void;

  /**
   * Save settings to storage.
   */
  save(): void;
}
