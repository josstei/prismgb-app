/**
 * Main Process Event Channels Configuration
 * Defines event channel constants for main process EventBus
 */

export const MainEventChannels = {
  DEVICE: {
    CONNECTION_CHANGED: 'device:connection-changed',
    CHECK_ERROR: 'device:check-error',
  },
  UPDATE: {
    STATE_CHANGED: 'update:state-changed',
  }
} as const;

/**
 * Type representing all main event channels
 */
export type MainEventChannel =
  | typeof MainEventChannels.DEVICE[keyof typeof MainEventChannels.DEVICE]
  | typeof MainEventChannels.UPDATE[keyof typeof MainEventChannels.UPDATE];
