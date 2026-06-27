/**
 * Main-process entry point for @prismgb/transcode.
 * Imported only by the main process (`@prismgb/transcode/service`); kept out of
 * the renderer-facing barrel so the service's node/native dependencies
 * (ffmpeg-static, ffprobe-static, node:child_process, electron) never reach the
 * renderer bundle.
 */

export { TranscodeService } from './transcode.service.js';
export type { TranscodeJob, TranscodeOptions, TranscodeResult, CancelResult, StatusResult } from './transcode.service.js';
