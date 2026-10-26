import { z } from 'zod';
import { TRANSCODE_CONFIG, type TranscodeFormat } from '@platform/transcode';

/**
 * Transcode input + subscription payload schemas.
 *
 * Inputs port `isValidTranscodeParams` (ArrayBuffer + supported format) and `isValidFfmpegArgs`
 * (non-empty string array) into a single `.input(z)` object, and `transcode-job-id` into the cancel
 * input. Outputs port `isValidTranscodeProgress` / `isValidTranscodeResult` / `isValidError` /
 * `isValidTranscodeCancelled` for the `.output(z)` subscription guards.
 */

const supportedTranscodeFormats = Object.keys(TRANSCODE_CONFIG.formats) as TranscodeFormat[];

const ffmpegInputArgsSchema = z.array(z.string().min(1));

export const transcodeStartSchema = z
  .object({
    inputBuffer: z.instanceof(ArrayBuffer),
    format: z.enum(supportedTranscodeFormats),
    outputFilename: z.string().optional(),
    inputArgs: ffmpegInputArgsSchema.optional()
  })
  .passthrough();

export const transcodeCancelSchema = z.object({
  jobId: z.string().min(1)
});
