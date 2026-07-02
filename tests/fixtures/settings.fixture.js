/**
 * Settings Fixtures
 *
 * Centralized test data for settings-related tests.
 */
import { SettingsDefinitions as settingsDefinitions } from '@renderer/lib/settings.definitions.js';
import { PRESET_POLICY } from '@platform/gpu';

const settingDefaults = Object.fromEntries(
  settingsDefinitions.definitions.map((definition) => [definition.name, definition.default])
);

const recordingFormatDefinition = settingsDefinitions.definitions.find(
  (definition) => definition.name === 'recordingFormat'
);

/**
 * Default application settings
 */
export const DEFAULT_SETTINGS = {
  ...settingDefaults,
};

/**
 * Settings for performance mode
 */
export const PERFORMANCE_MODE_SETTINGS = {
  enabled: {
    performanceMode: true,
    renderPreset: 'performance',
  },
  disabled: {
    performanceMode: false,
    renderPreset: PRESET_POLICY.rendererDefaultId,
  },
  quality: {
    performanceMode: false,
    renderPreset: 'hi-def',
  },
};

/**
 * Render presets
 */
export const RENDER_PRESETS = {
  trueColor: {
    name: 'true-color',
    imageSmoothingEnabled: false,
    description: 'Color-accurate rendering',
  },
  vibrant: {
    name: 'vibrant',
    imageSmoothingEnabled: false,
    description: 'Saturated default rendering',
  },
  hiDef: {
    name: 'hi-def',
    imageSmoothingEnabled: false,
    description: 'High-definition sharpening',
  },
  vintage: {
    name: 'vintage',
    imageSmoothingEnabled: false,
    description: 'Warm vintage palette',
  },
  pixel: {
    name: 'pixel',
    imageSmoothingEnabled: false,
    description: 'Pixel-emphasized rendering',
  },
  performance: {
    name: 'performance',
    imageSmoothingEnabled: false,
    description: 'Low-cost rendering preset',
  },
};

/**
 * Volume settings
 */
export const VOLUME_SETTINGS = {
  muted: 0,
  low: 25,
  medium: 50,
  default: settingDefaults.gameVolume,
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
    min: 0.5,
    max: 1.5,
    default: settingDefaults.globalBrightness,
  },
};

/**
 * Recording format settings
 */
export const RECORDING_FORMATS = {
  ...Object.fromEntries(
    recordingFormatDefinition.allowedValues.map((format) => [
      format,
      {
        format,
        extension: `.${format}`,
      },
    ])
  ),
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
    data: 75,
  },
  brightnessChanged: {
    event: 'settings:brightness-changed',
    data: 1.2,
  },
  performanceModeChanged: {
    event: 'settings:performance-mode-changed',
    data: true,
  },
  renderPresetChanged: {
    event: 'settings:render-preset-changed',
    data: 'vibrant',
  },
  cinematicModeChanged: {
    event: 'settings:cinematic-mode-changed',
    data: { enabled: false },
  },
  minimalistFullscreenChanged: {
    event: 'settings:minimalist-fullscreen-changed',
    data: false,
  },
  recordingFormatChanged: {
    event: 'settings:recording-format-changed',
    data: settingDefaults.recordingFormat,
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
    performanceMode: true,
    renderPreset: 'performance',
  });
}

/**
 * Creates quality-optimized settings
 */
export function createQualitySettings() {
  return createSettingsFixture({
    performanceMode: false,
    renderPreset: 'hi-def',
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
