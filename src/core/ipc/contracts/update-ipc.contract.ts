/**
 * Update status.
 */
export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error';

/**
 * Update info for available update.
 */
export interface UpdateInfo {
  version: string;
  releaseDate?: string;
  releaseNotes?: string;
}

/**
 * Update download progress.
 */
export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

/**
 * Update error payload.
 */
export interface UpdateError {
  message: string;
  code?: string;
}

/**
 * Get status response.
 */
export interface UpdateStatusResponse {
  status: UpdateStatus;
  info?: UpdateInfo;
  error?: UpdateError;
}
