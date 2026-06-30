/**
 * Test Fixtures Index
 *
 * Central export for all test fixtures.
 * Use these fixtures instead of hardcoded values.
 */

// Settings fixtures
export {
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
} from './settings.fixture.js';

// Capture fixtures
export {
  SCREENSHOT_PATTERNS,
  RECORDING_PATTERNS,
  SCREENSHOT_FIXTURE,
  RECORDING_FIXTURE,
  MEDIA_RECORDER_OPTIONS,
  CAPTURE_EVENTS,
  UI_CAPTURE_EVENTS,
  RECORDING_STATES,
  RECORDING_ERRORS,
  RECORDED_CHUNKS,
  createScreenshotBlob,
  createRecordingBlob,
  createRecordedChunks,
  createCaptureEventFixture,
} from './capture.fixture.js';
