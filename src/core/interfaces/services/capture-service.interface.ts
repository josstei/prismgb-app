/**
 * Screenshot result.
 */
export interface ScreenshotResult {
  blob: Blob;
  filename: string;
  timestamp: number;
}

/**
 * Recording state.
 */
export type RecordingState = 'idle' | 'recording' | 'stopping';

/**
 * Recording result.
 */
export interface RecordingResult {
  blob: Blob;
  filename: string;
  duration: number;
  timestamp: number;
}

/**
 * Interface for capture service.
 */
export interface ICaptureService {
  /**
   * Take a screenshot.
   */
  takeScreenshot(): Promise<ScreenshotResult>;

  /**
   * Start video recording.
   */
  startRecording(): Promise<void>;

  /**
   * Stop video recording.
   */
  stopRecording(): Promise<RecordingResult>;

  /**
   * Get current recording state.
   */
  getRecordingState(): RecordingState;

  /**
   * Check if recording is in progress.
   */
  isRecording(): boolean;
}
