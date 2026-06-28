import { z } from 'zod';
import { TRANSCODE_CONFIG } from '@prismgb/transcode';
import { updateErrorSchema } from './update.schemas.js';

/**
 * Transcode input + subscription payload schemas.
 *
 * Inputs port `isValidTranscodeParams` (ArrayBuffer + supported format) and `isValidFfmpegArgs`
 * (non-empty string array) into a single `.input(z)` object, and `transcode-job-id` into the cancel
 * input. Outputs port `isValidTranscodeProgress` / `isValidTranscodeResult` / `isValidError` /
 * `isValidTranscodeCancelled` for the `.output(z)` subscription guards.
 */

const supportedTranscodeFormats = new Set(Object.keys(TRANSCODE_CONFIG.formats));

const ffmpegInputArgsSchema = z.array(z.string().min(1));

export const transcodeStartSchema = z
  .object({
    inputBuffer: z.instanceof(ArrayBuffer),
    format: z
      .string()
      .min(1)
      .refine((format) => supportedTranscodeFormats.has(format.toLowerCase()), 'Unsupported transcode format'),
    outputFilename: z.string().optional(),
    inputArgs: ffmpegInputArgsSchema.optional(),
    interrupted: z.boolean().optional()
  })
  .passthrough();

export const transcodeCancelSchema = z.object({
  jobId: z.string().min(1)
});

export const transcodeProgressSchema = z
  .object({
    percent: z.number(),
    jobId: z.string().optional(),
    timeUs: z.number().optional(),
    elapsedMs: z.number().optional()
  })
  .passthrough();

export const transcodeCompletedSchema = z
  .object({
    jobId: z.string().optional(),
    outputPath: z.string().optional(),
    filePath: z.string().nullable().optional()
  })
  .passthrough();

export const transcodeErrorSchema = updateErrorSchema;

export const transcodeCancelledSchema = z
  .object({
    jobId: z.string().optional()
  })
  .passthrough();
