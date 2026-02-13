/**
 * Event channel constants shared across renderer layers.
 *
 * This is the source-of-truth contract for EventBus topic names.
 */
export const EventChannels = {
  // System events (EventBus internals)
  SYSTEM: {
    HANDLER_ERROR: 'system:handler-error'
  },

  // Device events
  DEVICE: {
    STATUS_CHANGED: 'device:status-changed',
    SUPPORTED_DEVICE_AVAILABLE: 'device:supported-device-available',
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
    RENDER_PRESET_CHANGED: 'settings:render-preset-changed',
    BRIGHTNESS_CHANGED: 'settings:brightness-changed',
    PERFORMANCE_MODE_CHANGED: 'settings:performance-mode-changed',
    CINEMATIC_MODE_CHANGED: 'settings:cinematic-mode-changed',
    MINIMALIST_FULLSCREEN_CHANGED: 'settings:minimalist-fullscreen-changed',
    PREFERENCES_LOADED: 'settings:preferences-loaded',
    RECORDING_FORMAT_CHANGED: 'settings:recording-format-changed'
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
    RECORD_BUTTON_DISABLED: 'ui:record-button-disabled',
    RECORD_BUTTON_ENABLED: 'ui:record-button-enabled',
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
  },

  // Notes events
  NOTES: {
    NOTE_CREATED: 'notes:note-created',
    NOTE_UPDATED: 'notes:note-updated',
    NOTE_DELETED: 'notes:note-deleted'
  },

  // Transcode events
  TRANSCODE: {
    STARTED: 'transcode:started',
    PROGRESS: 'transcode:progress',
    COMPLETED: 'transcode:completed',
    ERROR: 'transcode:error',
    CANCELLED: 'transcode:cancelled'
  }
} as const;

/**
 * Type-safe event payload mapping for EventBus
 * Maps each event channel string to its expected payload type
 */
export type EventPayloadMap = {
  // SYSTEM
  [EventChannels.SYSTEM.HANDLER_ERROR]: {
    eventName: string;
    error: { name: string; message: string; stack?: string };
  };

  // DEVICE
  [EventChannels.DEVICE.STATUS_CHANGED]: {
    connected: boolean;
    deviceName?: string;
  };
  [EventChannels.DEVICE.SUPPORTED_DEVICE_AVAILABLE]: {
    deviceId: string;
    label: string;
  };
  [EventChannels.DEVICE.ENUMERATION_FAILED]: {
    error: string;
    reason: string;
  };
  [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: void;

  // STREAM
  [EventChannels.STREAM.STARTED]: {
    stream: MediaStream;
    device: MediaDeviceInfo;
    settings: MediaTrackSettings;
    capabilities: MediaTrackCapabilities;
  };
  [EventChannels.STREAM.STOPPED]: void;
  [EventChannels.STREAM.ERROR]: {
    error: Error | unknown;
    operation: string;
    deviceId: string;
  };
  [EventChannels.STREAM.HEALTH_OK]: unknown;
  [EventChannels.STREAM.HEALTH_TIMEOUT]: unknown;

  // CAPTURE
  [EventChannels.CAPTURE.SCREENSHOT_TRIGGERED]: void;
  [EventChannels.CAPTURE.SCREENSHOT_READY]: {
    blob: Blob;
    filename: string;
  };
  [EventChannels.CAPTURE.RECORDING_STARTED]: void;
  [EventChannels.CAPTURE.RECORDING_STOPPED]: void;
  [EventChannels.CAPTURE.RECORDING_READY]: {
    blob: Blob;
    filename: string;
  };
  [EventChannels.CAPTURE.RECORDING_ERROR]: {
    error: Error | unknown;
    message?: string;
  };
  [EventChannels.CAPTURE.RECORDING_DEGRADED]: {
    droppedFrames: number;
  };

  // SETTINGS
  [EventChannels.SETTINGS.VOLUME_CHANGED]: number;
  [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: string;
  [EventChannels.SETTINGS.BRIGHTNESS_CHANGED]: number;
  [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: boolean;
  [EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED]: {
    enabled: boolean;
  };
  [EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED]: boolean;
  [EventChannels.SETTINGS.PREFERENCES_LOADED]: unknown;
  [EventChannels.SETTINGS.RECORDING_FORMAT_CHANGED]: string;

  // PERFORMANCE
  [EventChannels.PERFORMANCE.STATE_CHANGED]: unknown;
  [EventChannels.PERFORMANCE.UI_MODE_CHANGED]: string;
  [EventChannels.PERFORMANCE.RENDER_MODE_CHANGED]: boolean;
  [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: {
    label: string;
    delayMs?: number;
  };

  // RENDER
  [EventChannels.RENDER.CAPABILITY_DETECTED]: unknown;
  [EventChannels.RENDER.PIPELINE_READY]: {
    api: string;
  };
  [EventChannels.RENDER.PIPELINE_ERROR]: {
    message: string;
    code?: string;
  };
  [EventChannels.RENDER.STATS_UPDATE]: unknown;
  [EventChannels.RENDER.CANVAS_EXPIRED]: void;
  [EventChannels.RENDER.CANVAS_RECREATED]: {
    oldCanvas: HTMLCanvasElement;
    newCanvas: HTMLCanvasElement;
  };

  // UI
  [EventChannels.UI.STATUS_MESSAGE]: {
    message: string;
    type?: 'error' | 'warning' | 'info';
  };
  [EventChannels.UI.DEVICE_STATUS]: {
    status: unknown;
  };
  [EventChannels.UI.OVERLAY_MESSAGE]: {
    deviceConnected: boolean;
  };
  [EventChannels.UI.OVERLAY_VISIBLE]: {
    visible: boolean;
  };
  [EventChannels.UI.OVERLAY_ERROR]: {
    message: string;
  };
  [EventChannels.UI.STREAMING_MODE]: {
    enabled: boolean;
  };
  [EventChannels.UI.STREAM_INFO]: {
    settings: MediaTrackSettings;
  };
  [EventChannels.UI.SHUTTER_FLASH]: void;
  [EventChannels.UI.RECORD_BUTTON_POP]: void;
  [EventChannels.UI.RECORD_BUTTON_PRESS]: void;
  [EventChannels.UI.BUTTON_FEEDBACK]: {
    buttonId?: string;
  };
  [EventChannels.UI.RECORDING_STATE]: {
    active: boolean;
  };
  [EventChannels.UI.RECORD_BUTTON_DISABLED]: void;
  [EventChannels.UI.RECORD_BUTTON_ENABLED]: void;
  [EventChannels.UI.FULLSCREEN_STATE]: {
    active: boolean;
  };
  [EventChannels.UI.WINDOW_RESIZED]: void;
  [EventChannels.UI.SCREENSHOT_REQUESTED]: void;
  [EventChannels.UI.RECORDING_TOGGLE_REQUESTED]: void;
  [EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED]: void;
  [EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED]: void;
  [EventChannels.UI.STREAM_START_REQUESTED]: void;
  [EventChannels.UI.STREAM_STOP_REQUESTED]: void;

  // UPDATE
  [EventChannels.UPDATE.AVAILABLE]: unknown;
  [EventChannels.UPDATE.NOT_AVAILABLE]: unknown;
  [EventChannels.UPDATE.PROGRESS]: unknown;
  [EventChannels.UPDATE.DOWNLOADED]: unknown;
  [EventChannels.UPDATE.ERROR]: unknown;
  [EventChannels.UPDATE.STATE_CHANGED]: unknown;
  [EventChannels.UPDATE.BADGE_SHOW]: void;
  [EventChannels.UPDATE.BADGE_HIDE]: void;

  // NOTES
  [EventChannels.NOTES.NOTE_CREATED]: unknown;
  [EventChannels.NOTES.NOTE_UPDATED]: unknown;
  [EventChannels.NOTES.NOTE_DELETED]: {
    id: string;
  };

  // TRANSCODE
  [EventChannels.TRANSCODE.STARTED]: {
    jobId: string;
    format: string;
  };
  [EventChannels.TRANSCODE.PROGRESS]: unknown;
  [EventChannels.TRANSCODE.COMPLETED]: unknown;
  [EventChannels.TRANSCODE.ERROR]: unknown;
  [EventChannels.TRANSCODE.CANCELLED]: unknown;
};
