export const IPC_CHANNELS = {
  DEVICE: { GET_STATUS: 'device:get-status', CONNECTED: 'device:connected', DISCONNECTED: 'device:disconnected' },
  SHELL: { OPEN_EXTERNAL: 'shell:open-external' },
  WINDOW: { SET_FULLSCREEN: 'window:set-fullscreen', IS_FULLSCREEN: 'window:is-fullscreen', ENTER_FULLSCREEN: 'window:enter-fullscreen', LEAVE_FULLSCREEN: 'window:leave-fullscreen', RESIZED: 'window:resized' },
  UPDATE: { GET_STATUS: 'update:get-status', CHECK: 'update:check', DOWNLOAD: 'update:download', INSTALL: 'update:install', AVAILABLE: 'update:available', NOT_AVAILABLE: 'update:not-available', PROGRESS: 'update:progress', DOWNLOADED: 'update:downloaded', ERROR: 'update:error' },
  PERFORMANCE: { GET_METRICS: 'performance:get-metrics' },
  GPU: { GET_POLICY: 'gpu:get-policy' },
  LOGIN_ITEM: { GET: 'login-item:get', SET: 'login-item:set' },
  TRANSCODE: { START: 'transcode:start', CANCEL: 'transcode:cancel', GET_STATUS: 'transcode:get-status', PROGRESS: 'transcode:progress', COMPLETED: 'transcode:completed', ERROR: 'transcode:error', CANCELLED: 'transcode:cancelled' }
} as const;

export type IpcChannels = typeof IPC_CHANNELS;
