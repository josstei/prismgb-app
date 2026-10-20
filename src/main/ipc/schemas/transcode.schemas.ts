import { z } from 'zod';
import { TRANSCODE_FORMATS } from '@platform/ipc';
import { updateErrorSchema } from './update.schemas.js';

const supportedTranscodeFormats = new Set<string>(TRANSCODE_FORMATS);

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
