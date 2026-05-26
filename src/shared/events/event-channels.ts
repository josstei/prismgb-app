/**
 * Event channel constants shared across renderer layers.
 *
 * This is the source-of-truth contract for EventBus topic names.
 */
import { getEventManifestScopeEvents, toManifestEventKey } from './event.manifest.js';

const rendererEventChannelsByKey = new Map(
  getEventManifestScopeEvents('renderer').map((entry) => [
    toManifestEventKey(entry.domain, entry.name),
    entry.value
  ] as const)
);

function getRendererChannel<const TDomain extends string, const TName extends string>(
  domain: TDomain,
  name: TName
): `${TDomain}:${TName}` {
  const key = toManifestEventKey(domain, name) as `${TDomain}:${TName}`;
  const manifestValue = rendererEventChannelsByKey.get(key);

  if (!manifestValue) {
    throw new Error(`Renderer event "${key}" not found in event manifest`);
  }

  // Keep the runtime value contract strict: value must match domain:name key form.
  if (manifestValue !== key) {
    throw new Error(`Renderer event "${key}" has mismatched manifest value "${manifestValue}"`);
  }

  return manifestValue as `${TDomain}:${TName}`;
}

// CODEBASE_RENDERER_EVENT_CHANNELS:START
export const EventChannels = {
  // System events (EventBus internals)
  SYSTEM: {
    HANDLER_ERROR: getRendererChannel('system', 'handler-error')
  },

  // Device events
  DEVICE: {
    STATUS_CHANGED: getRendererChannel('device', 'status-changed'),
    SUPPORTED_DEVICE_AVAILABLE: getRendererChannel('device', 'supported-device-available'),
    ENUMERATION_FAILED: getRendererChannel('device', 'enumeration-failed'),
    DISCONNECTED_DURING_SESSION: getRendererChannel('device', 'disconnected-during-session')
  },

  // Stream events
  STREAM: {
    STARTED: getRendererChannel('stream', 'started'),
    STOPPED: getRendererChannel('stream', 'stopped'),
    ERROR: getRendererChannel('stream', 'error'),
    HEALTH_OK: getRendererChannel('stream', 'health-ok'),
    HEALTH_TIMEOUT: getRendererChannel('stream', 'health-timeout')
  },

  // Capture events
  CAPTURE: {
    SCREENSHOT_TRIGGERED: getRendererChannel('capture', 'screenshot-triggered'),
    SCREENSHOT_READY: getRendererChannel('capture', 'screenshot-ready'),
    RECORDING_STARTED: getRendererChannel('capture', 'recording-started'),
    RECORDING_STOPPED: getRendererChannel('capture', 'recording-stopped'),
    RECORDING_READY: getRendererChannel('capture', 'recording-ready'),
    RECORDING_ERROR: getRendererChannel('capture', 'recording-error'),
    RECORDING_DEGRADED: getRendererChannel('capture', 'recording-degraded')
  },

  // Settings events
  SETTINGS: {
    VOLUME_CHANGED: getRendererChannel('settings', 'volume-changed'),
    RENDER_PRESET_CHANGED: getRendererChannel('settings', 'render-preset-changed'),
    BRIGHTNESS_CHANGED: getRendererChannel('settings', 'brightness-changed'),
    PERFORMANCE_MODE_CHANGED: getRendererChannel('settings', 'performance-mode-changed'),
    CINEMATIC_MODE_CHANGED: getRendererChannel('settings', 'cinematic-mode-changed'),
    MINIMALIST_FULLSCREEN_CHANGED: getRendererChannel('settings', 'minimalist-fullscreen-changed'),
    PREFERENCES_LOADED: getRendererChannel('settings', 'preferences-loaded'),
    RECORDING_FORMAT_CHANGED: getRendererChannel('settings', 'recording-format-changed')
  },

  PERFORMANCE: {
    STATE_CHANGED: getRendererChannel('performance', 'state-changed'),
    UI_MODE_CHANGED: getRendererChannel('performance', 'ui-mode-changed'),
    RENDER_MODE_CHANGED: getRendererChannel('performance', 'render-mode-changed'),
    MEMORY_SNAPSHOT_REQUESTED: getRendererChannel('performance', 'memory-snapshot-requested')
  },

  // Render events (GPU rendering pipeline)
  RENDER: {
    CAPABILITY_DETECTED: getRendererChannel('render', 'capability-detected'),
    PIPELINE_READY: getRendererChannel('render', 'pipeline-ready'),
    PIPELINE_ERROR: getRendererChannel('render', 'pipeline-error'),
    STATS_UPDATE: getRendererChannel('render', 'stats-update'),
    CANVAS_EXPIRED: getRendererChannel('render', 'canvas-expired'),
    CANVAS_RECREATED: getRendererChannel('render', 'canvas-recreated')
  },

  // UI events
  UI: {
    STATUS_MESSAGE: getRendererChannel('ui', 'status-message'),
    DEVICE_STATUS: getRendererChannel('ui', 'device-status'),
    OVERLAY_MESSAGE: getRendererChannel('ui', 'overlay-message'),
    OVERLAY_VISIBLE: getRendererChannel('ui', 'overlay-visible'),
    OVERLAY_ERROR: getRendererChannel('ui', 'overlay-error'),
    STREAMING_MODE: getRendererChannel('ui', 'streaming-mode'),
    STREAM_INFO: getRendererChannel('ui', 'stream-info'),
    SHUTTER_FLASH: getRendererChannel('ui', 'shutter-flash'),
    RECORD_BUTTON_POP: getRendererChannel('ui', 'record-button-pop'),
    RECORD_BUTTON_PRESS: getRendererChannel('ui', 'record-button-press'),
    BUTTON_FEEDBACK: getRendererChannel('ui', 'button-feedback'),
    RECORDING_STATE: getRendererChannel('ui', 'recording-state'),
    RECORD_BUTTON_DISABLED: getRendererChannel('ui', 'record-button-disabled'),
    RECORD_BUTTON_ENABLED: getRendererChannel('ui', 'record-button-enabled'),
    FULLSCREEN_STATE: getRendererChannel('ui', 'fullscreen-state'),
    WINDOW_RESIZED: getRendererChannel('ui', 'window-resized'),
    // UI command events (decoupled from orchestrators)
    SCREENSHOT_REQUESTED: getRendererChannel('ui', 'screenshot-requested'),
    RECORDING_TOGGLE_REQUESTED: getRendererChannel('ui', 'recording-toggle-requested'),
    FULLSCREEN_TOGGLE_REQUESTED: getRendererChannel('ui', 'fullscreen-toggle-requested'),
    CINEMATIC_TOGGLE_REQUESTED: getRendererChannel('ui', 'cinematic-toggle-requested'),
    STREAM_START_REQUESTED: getRendererChannel('ui', 'stream-start-requested'),
    STREAM_STOP_REQUESTED: getRendererChannel('ui', 'stream-stop-requested')
  },

  // Update events
  UPDATE: {
    AVAILABLE: getRendererChannel('update', 'available'),
    NOT_AVAILABLE: getRendererChannel('update', 'not-available'),
    PROGRESS: getRendererChannel('update', 'progress'),
    DOWNLOADED: getRendererChannel('update', 'downloaded'),
    ERROR: getRendererChannel('update', 'error'),
    STATE_CHANGED: getRendererChannel('update', 'state-changed'),
    BADGE_SHOW: getRendererChannel('update', 'badge-show'),
    BADGE_HIDE: getRendererChannel('update', 'badge-hide')
  },

  // Notes events
  NOTES: {
    NOTE_CREATED: getRendererChannel('notes', 'note-created'),
    NOTE_UPDATED: getRendererChannel('notes', 'note-updated'),
    NOTE_DELETED: getRendererChannel('notes', 'note-deleted')
  },

  // Transcode events
  TRANSCODE: {
    STARTED: getRendererChannel('transcode', 'started'),
    PROGRESS: getRendererChannel('transcode', 'progress'),
    COMPLETED: getRendererChannel('transcode', 'completed'),
    ERROR: getRendererChannel('transcode', 'error'),
    CANCELLED: getRendererChannel('transcode', 'cancelled')
  }
} as const;
// CODEBASE_RENDERER_EVENT_CHANNELS:END
