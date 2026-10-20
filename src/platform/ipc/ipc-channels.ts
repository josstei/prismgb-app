/** IpcPushBridge keys for main-to-renderer push subscriptions. */
export const IPC_CHANNELS = {
  DEVICE: { CONNECTED: 'device:connected', DISCONNECTED: 'device:disconnected' },
  WINDOW: { ENTER_FULLSCREEN: 'window:enter-fullscreen', LEAVE_FULLSCREEN: 'window:leave-fullscreen', RESIZED: 'window:resized' },
  UPDATE: { AVAILABLE: 'update:available', NOT_AVAILABLE: 'update:not-available', PROGRESS: 'update:progress', DOWNLOADED: 'update:downloaded', ERROR: 'update:error' },
  TRANSCODE: { PROGRESS: 'transcode:progress', COMPLETED: 'transcode:completed', ERROR: 'transcode:error', CANCELLED: 'transcode:cancelled' }
} as const;
