import { z } from 'zod';

export const rendererShutdownRequestSchema = z.object({ requestId: z.string().min(1) }).strict();

// Passthrough retains upstream updater metadata while validating fields consumed by the app.
export const updateInfoSchema = z.object({
  version: z.string().optional(),
  releaseDate: z.string().optional(),
  releaseNotes: z.unknown().optional(),
  reason: z.string().optional()
}).passthrough();
export const updateProgressSchema = z.object({
  percent: z.number().optional(),
  bytesPerSecond: z.number().optional(),
  transferred: z.number().optional(),
  total: z.number().optional()
}).passthrough();
export const updateErrorSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional()
}).passthrough();
export const transcodeProgressSchema = z.object({
  jobId: z.string().min(1),
  percent: z.number(),
  timeUs: z.number().optional(),
  elapsedMs: z.number().optional()
}).passthrough();
export const transcodeCompletedSchema = z.object({
  jobId: z.string().min(1),
  filePath: z.string().nullable().optional(),
  outputPath: z.string().optional()
}).passthrough();
export const transcodeErrorSchema = z.object({
  jobId: z.string().min(1),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional()
}).passthrough();
export const transcodeCancelledSchema = z.object({ jobId: z.string().min(1) }).passthrough();

type KnownPayload<T extends z.ZodObject> = Pick<z.output<T>, keyof T['shape']>;

export type UpdateInfoPayload = KnownPayload<typeof updateInfoSchema>;
export type UpdateProgressPayload = KnownPayload<typeof updateProgressSchema>;
export type UpdateErrorPayload = KnownPayload<typeof updateErrorSchema>;
export type TranscodeProgressPayload = KnownPayload<typeof transcodeProgressSchema>;
export type TranscodeCompletedPayload = KnownPayload<typeof transcodeCompletedSchema>;
export type TranscodeErrorPayload = KnownPayload<typeof transcodeErrorSchema>;
export type TranscodeCancelledPayload = KnownPayload<typeof transcodeCancelledSchema>;
