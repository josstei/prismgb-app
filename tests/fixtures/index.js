/**
 * Test Fixtures Index
 *
 * Central export for all test fixtures.
 * Use these fixtures instead of hardcoded values.
 */

// Device fixtures
export {
  CHROMATIC_DEVICE,
  GENERIC_CAMERA,
  UNSUPPORTED_DEVICE,
  MULTIPLE_DEVICES,
  CHROMATIC_CAPABILITIES,
  CHROMATIC_STREAM_SETTINGS,
  TRACK_CAPABILITIES,
  USB_DEVICE_INFO,
  createDeviceFixture,
  createDeviceListFixture,
} from './devices.fixture.js';

// Stream fixtures
export {
  CHROMATIC_STREAM,
  STREAM_CONSTRAINTS,
  MINIMAL_CONSTRAINTS,
  HIGH_FRAMERATE_CONSTRAINTS,
  CANVAS_DIMENSIONS,
  DEFAULT_CANVAS,
  RENDER_OPTIONS,
  STREAM_EVENTS,
  PERFORMANCE_METRICS,
  createStreamFixture,
  createConstraintsFixture,
} from './streams.fixture.js';

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

// Re-export Chromatic specs from manifest-backed fixture source
export { CHROMATIC_SPECS } from '../devices/media.testkit.ts';
