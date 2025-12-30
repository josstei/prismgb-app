export const MainEventChannels = {
  DEVICE: {
    CONNECTION_CHANGED: 'device:connection-changed',
    STATUS_UPDATED: 'device:status-updated',
    CHECK_ERROR: 'device:check-error',
  },
  UPDATE: {
    STATE_CHANGED: 'update:state-changed',
    PROGRESS: 'update:progress',
  },
  APP: {
    READY: 'app:ready',
    SHUTDOWN: 'app:shutdown',
  }
};
