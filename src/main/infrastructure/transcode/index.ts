/**
 * Transcode Infrastructure
 * Barrel export for transcode services and utilities
 */

export { TranscodeService } from './transcode.service.js';
export { TranscodeProcess, probeDuration } from './transcode-process.js';
export { getFfmpegPath, getFfprobePath, getOptionalFfprobePath, validateFfmpegBinaries } from './ffmpeg-path.utils.js';
export {
  createTempSession,
  writeTempFile,
  cleanupSession,
  cleanupAllSessions
} from './transcode-temp.utils.js';

export type { TranscodeJob, TranscodeOptions, TranscodeResult, CancelResult, StatusResult } from './transcode.service.js';
export type { TranscodeProgressData, TranscodeCompletedData } from './transcode-process.js';
export type { SessionInfo } from './transcode-temp.utils.js';
export type { FfmpegBinaryPaths } from './ffmpeg-path.utils.js';
