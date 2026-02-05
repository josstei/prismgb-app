/**
 * Transcode start request.
 */
export interface TranscodeStartRequest {
  inputPath: string;
  outputPath: string;
  format: 'webm' | 'mp4' | 'mov' | 'gif';
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Transcode progress event payload.
 */
export interface TranscodeProgressPayload {
  percent: number;
  frame?: number;
  fps?: number;
  time?: string;
}

/**
 * Transcode completed event payload.
 */
export interface TranscodeCompletedPayload {
  outputPath: string;
  duration: number;
}

/**
 * Transcode error event payload.
 */
export interface TranscodeErrorPayload {
  message: string;
  code?: string;
}

/**
 * Transcode status response.
 */
export interface TranscodeStatusResponse {
  active: boolean;
  progress?: TranscodeProgressPayload;
}
