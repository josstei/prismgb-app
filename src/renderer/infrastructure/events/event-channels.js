/**
 * Event Channel Constants
 *
 * Centralized constants for all EventBus event names.
 * Prevents typos and enables IDE autocomplete.
 */

export const EventChannels = {
  // System events (EventBus internals)
  SYSTEM: {
    HANDLER_ERROR: 'system:handler-error'
  },

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
    SCREENSHOT_TRIGGERED: 'capture:screenshot-triggered',
    SCREENSHOT_READY: 'capture:screenshot-ready',
    RECORDING_STARTED: 'capture:recording-started',
    RECORDING_STOPPED: 'capture:recording-stopped',
    RECORDING_READY: 'capture:recording-ready',
    RECORDING_ERROR: 'capture:recording-error',
    RECORDING_DEGRADED: 'capture:recording-degraded'
  },

  // Settings events
  SETTINGS: {
    VOLUME_CHANGED: 'settings:volume-changed',
    STATUS_STRIP_CHANGED: 'settings:status-strip-changed',
    RENDER_PRESET_CHANGED: 'settings:render-preset-changed',
    BRIGHTNESS_CHANGED: 'settings:brightness-changed',
    PERFORMANCE_MODE_CHANGED: 'settings:performance-mode-changed',
    CINEMATIC_MODE_CHANGED: 'settings:cinematic-mode-changed',
    FULLSCREEN_ON_STARTUP_CHANGED: 'settings:fullscreen-on-startup-changed',
    PREFERENCES_LOADED: 'settings:preferences-loaded',
    PREFERENCES_LOAD_FAILED: 'settings:preferences-load-failed'
  },

  PERFORMANCE: {
    STATE_CHANGED: 'performance:state-changed',
    UI_MODE_CHANGED: 'performance:ui-mode-changed',
    RENDER_MODE_CHANGED: 'performance:render-mode-changed',
    MEMORY_SNAPSHOT_REQUESTED: 'performance:memory-snapshot-requested'
  },

  // Render events (GPU rendering pipeline)
  RENDER: {
    CAPABILITY_DETECTED: 'render:capability-detected',
    PIPELINE_READY: 'render:pipeline-ready',
    PIPELINE_ERROR: 'render:pipeline-error',
    STATS_UPDATE: 'render:stats-update',
    CANVAS_EXPIRED: 'render:canvas-expired',
    CANVAS_RECREATED: 'render:canvas-recreated'
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
    CINEMATIC_MODE: 'ui:cinematic-mode',
    FULLSCREEN_STATE: 'ui:fullscreen-state',
    WINDOW_RESIZED: 'ui:window-resized',
    // UI command events (decoupled from orchestrators)
    SCREENSHOT_REQUESTED: 'ui:screenshot-requested',
    RECORDING_TOGGLE_REQUESTED: 'ui:recording-toggle-requested',
    FULLSCREEN_TOGGLE_REQUESTED: 'ui:fullscreen-toggle-requested',
    CINEMATIC_TOGGLE_REQUESTED: 'ui:cinematic-toggle-requested',
    STREAM_START_REQUESTED: 'ui:stream-start-requested',
    STREAM_STOP_REQUESTED: 'ui:stream-stop-requested'
  },

  // Update events
  UPDATE: {
    AVAILABLE: 'update:available',
    NOT_AVAILABLE: 'update:not-available',
    PROGRESS: 'update:progress',
    DOWNLOADED: 'update:downloaded',
    ERROR: 'update:error',
    STATE_CHANGED: 'update:state-changed',
    BADGE_SHOW: 'update:badge-show',
    BADGE_HIDE: 'update:badge-hide'
  }
};
