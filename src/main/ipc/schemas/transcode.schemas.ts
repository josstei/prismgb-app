import { z } from 'zod';
import { TRANSCODE_FORMATS } from '@platform/ipc';
import { updateErrorSchema } from './update.schemas';

export const transcodeStartSchema = z.object({
  inputBuffer: z.instanceof(ArrayBuffer),
  format: z.enum(TRANSCODE_FORMATS),
  outputFilename: z.string().optional(),
  interrupted: z.boolean().optional()
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
