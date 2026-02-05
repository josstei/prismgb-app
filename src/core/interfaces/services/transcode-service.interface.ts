/**
 * Transcode format.
 */
export type TranscodeFormat = 'webm' | 'mp4' | 'mov' | 'gif';

/**
 * Transcode options.
 */
export interface TranscodeOptions {
  inputPath: string;
  outputPath: string;
  format: TranscodeFormat;
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Transcode progress.
 */
export interface TranscodeProgress {
  percent: number;
  frame?: number;
  fps?: number;
  time?: string;
}

/**
 * Transcode result.
 */
export interface TranscodeResult {
  success: boolean;
  outputPath: string;
  duration: number;
  error?: string;
}

/**
 * Interface for transcode service.
 */
export interface ITranscodeService {
  /**
   * Start transcoding a file.
   */
  start(options: TranscodeOptions): Promise<void>;

  /**
   * Cancel current transcode operation.
   */
  cancel(): Promise<void>;

  /**
   * Get current transcode status.
   */
  getStatus(): TranscodeProgress | null;

  /**
   * Check if transcoding is in progress.
   */
  isTranscoding(): boolean;
}
