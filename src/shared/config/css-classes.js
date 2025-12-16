/**
 * CSS Class Constants
 *
 * Centralized constants for all CSS classes used in JavaScript.
 * Prevents typos and enables IDE autocomplete.
 */

export const CSSClasses = {
  // Body state
  BODY_READY: 'ready',

  // Connection status
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  STATUS_STATE: 'status-state',

  // Overlay states
  READY: 'ready',
  WAITING: 'waiting',

  // Visibility
  HIDDEN: 'hidden',
  VISIBLE: 'visible',

  // Button states
  RECORDING: 'recording',
  ACTIVE: 'active',
  HIDING: 'hiding',

  // Mode classes
  CINEMATIC_ACTIVE: 'cinematic-active',
  STREAMING_MODE: 'streaming-mode',

  // Settings menu
  STATUS_HIDDEN: 'status-hidden',

  // Cursor visibility
  CURSOR_HIDDEN: 'cursor-hidden',

  // Fullscreen controls auto-hide
  FULLSCREEN_HEADER_HIDDEN: 'fullscreen-hidden',

  // Canvas resize animation
  FULLSCREEN_ANIMATING: 'fullscreen-animating',

  // Fullscreen mode active (body class for reliable CSS targeting in Electron)
  FULLSCREEN_ACTIVE: 'fullscreen-active',

  // Update states
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_CHECKING: 'checking',
  UPDATE_DOWNLOADING: 'downloading',
  UPDATE_DOWNLOADED: 'downloaded',
  UPDATE_ERROR: 'error'
};
