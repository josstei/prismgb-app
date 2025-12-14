/**
 * Event Channel Constants
 *
 * Centralized constants for all EventBus event names.
 * Prevents typos and enables IDE autocomplete.
 */

export const EventChannels = {
  // Device events
  DEVICE: {
    STATUS_CHANGED: 'device:status-changed',
    ENUMERATION_FAILED: 'device:enumeration-failed',
    DISCONNECTED_DURING_SESSION: 'device:disconnected-during-session'
  },

  // Stream events
  STREAM: {
    STARTED: 'stream:started',
    STOPPED: 'stream:stopped',
    ERROR: 'stream:error',
    HEALTH_OK: 'stream:health-ok',
    HEALTH_TIMEOUT: 'stream:health-timeout'
  },

  // Capture events
  CAPTURE: {
    SCREENSHOT_READY: 'capture:screenshot-ready',
    RECORDING_STARTED: 'capture:recording-started',
    RECORDING_STOPPED: 'capture:recording-stopped',
    RECORDING_READY: 'capture:recording-ready'
  },

  // Settings events
  SETTINGS: {
    VOLUME_CHANGED: 'settings:volume-changed',
    STATUS_STRIP_CHANGED: 'settings:status-strip-changed',
    RENDER_PRESET_CHANGED: 'settings:render-preset-changed'
  },

  // Render events (GPU rendering pipeline)
  RENDER: {
    CAPABILITY_DETECTED: 'render:capability-detected',
    PIPELINE_READY: 'render:pipeline-ready',
    PIPELINE_ERROR: 'render:pipeline-error',
    STATS_UPDATE: 'render:stats-update',
    QUALITY_CHANGED: 'render:quality-changed',
    PERFORMANCE_UPDATE: 'render:performance-update',
    PERFORMANCE_REPORT: 'render:performance-report',
    CANVAS_EXPIRED: 'render:canvas-expired'
  },

  // UI events
  UI: {
    STATUS_MESSAGE: 'ui:status-message',
    DEVICE_STATUS: 'ui:device-status',
    OVERLAY_MESSAGE: 'ui:overlay-message',
    OVERLAY_VISIBLE: 'ui:overlay-visible',
    OVERLAY_ERROR: 'ui:overlay-error',
    STREAMING_MODE: 'ui:streaming-mode',
    STREAM_INFO: 'ui:stream-info',
    SHUTTER_FLASH: 'ui:shutter-flash',
    RECORD_BUTTON_POP: 'ui:record-button-pop',
    RECORD_BUTTON_PRESS: 'ui:record-button-press',
    BUTTON_FEEDBACK: 'ui:button-feedback',
    RECORDING_STATE: 'ui:recording-state',
    VOLUME_LEVEL: 'ui:volume-level',
    VOLUME_SLIDER_VISIBLE: 'ui:volume-slider-visible',
    CINEMATIC_MODE: 'ui:cinematic-mode',
    FULLSCREEN_STATE: 'ui:fullscreen-state'
  }
};
