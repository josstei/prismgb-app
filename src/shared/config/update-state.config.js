/**
 * Update State Enum
 *
 * Shared enum for update states used across UI and service layers.
 */

export const UpdateState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not-available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  ERROR: 'error'
};
