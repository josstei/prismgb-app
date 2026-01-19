/**
 * Settings Fixtures
 *
 * Centralized test data for settings-related tests.
 */

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS = {
  volume: 100,
  brightness: 1.0,
  performanceMode: 'balanced',
  renderPreset: 'sharp',
  cinematicMode: true,
  minimalistFullscreen: false,
  recordingFormat: 'webm',
  autoUpdate: true,
};

/**
 * Settings for performance mode
 */
export const PERFORMANCE_MODE_SETTINGS = {
  performance: {
    performanceMode: 'performance',
    renderPreset: 'sharp',
  },
  balanced: {
    performanceMode: 'balanced',
    renderPreset: 'sharp',
  },
  quality: {
    performanceMode: 'quality',
    renderPreset: 'smooth',
  },
};

/**
 * Render presets
 */
export const RENDER_PRESETS = {
  sharp: {
    name: 'sharp',
    imageSmoothingEnabled: false,
    description: 'Crisp pixel-perfect rendering',
  },
  smooth: {
    name: 'smooth',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
    description: 'Smooth anti-aliased rendering',
  },
  retro: {
    name: 'retro',
    imageSmoothingEnabled: false,
    scanlines: true,
    description: 'CRT-style retro look',
  },
};

/**
 * Volume settings
 */
export const VOLUME_SETTINGS = {
  muted: 0,
  low: 25,
  medium: 50,
  high: 75,
  max: 100,
};

/**
 * Brightness settings
 */
export const BRIGHTNESS_SETTINGS = {
  dim: 0.5,
  normal: 1.0,
  bright: 1.5,
  slider: {
    min: 0,
    max: 100,
    default: 50,
  },
};

/**
 * Recording format settings
 */
export const RECORDING_FORMATS = {
  webm: {
    format: 'webm',
    mimeType: 'video/webm;codecs=vp8',
    extension: '.webm',
  },
  webmVp9: {
    format: 'webm',
    mimeType: 'video/webm;codecs=vp9',
    extension: '.webm',
  },
  mp4: {
    format: 'mp4',
    mimeType: 'video/mp4',
    extension: '.mp4',
  },
};

/**
 * UI config fixture
 */
export const UI_CONFIG = {
  WINDOW_CONFIG: {
    defaultWidth: 800,
    defaultHeight: 700,
    minWidth: 400,
    minHeight: 350,
  },
  TOOLBAR_HIDE_DELAY: 2000,
  SHUTTER_FLASH_DURATION: 150,
  BUTTON_FEEDBACK_DURATION: 100,
};

/**
 * App config fixture
 */
export const APP_CONFIG = {
  DEVICE_LAUNCH_DELAY: 1000,
  USB_SCAN_DELAY: 500,
  STREAM_HEALTH_TIMEOUT: 5000,
  RECONNECT_DELAY: 2000,
};

/**
 * Settings events fixture
 */
export const SETTINGS_EVENTS = {
  volumeChanged: {
    event: 'settings:volume-changed',
    data: { volume: 75 },
  },
  brightnessChanged: {
    event: 'settings:brightness-changed',
    data: { brightness: 1.2 },
  },
  performanceModeChanged: {
    event: 'settings:performance-mode-changed',
    data: { mode: 'quality' },
  },
  renderPresetChanged: {
    event: 'settings:render-preset-changed',
    data: { preset: 'smooth' },
  },
  cinematicModeChanged: {
    event: 'settings:cinematic-mode-changed',
    data: { enabled: false },
  },
  preferencesLoaded: {
    event: 'settings:preferences-loaded',
    data: DEFAULT_SETTINGS,
  },
};

/**
 * Creates a custom settings fixture
 * @param {Object} overrides - Properties to override
 * @returns {Object} Settings fixture
 */
export function createSettingsFixture(overrides = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
}

/**
 * Creates performance-optimized settings
 */
export function createPerformanceSettings() {
  return createSettingsFixture({
    performanceMode: 'performance',
    renderPreset: 'sharp',
    cinematicMode: false,
  });
}

/**
 * Creates quality-optimized settings
 */
export function createQualitySettings() {
  return createSettingsFixture({
    performanceMode: 'quality',
    renderPreset: 'smooth',
    cinematicMode: true,
  });
}

export default {
  DEFAULT_SETTINGS,
  PERFORMANCE_MODE_SETTINGS,
  RENDER_PRESETS,
  VOLUME_SETTINGS,
  BRIGHTNESS_SETTINGS,
  RECORDING_FORMATS,
  UI_CONFIG,
  APP_CONFIG,
  SETTINGS_EVENTS,
  createSettingsFixture,
  createPerformanceSettings,
  createQualitySettings,
};
