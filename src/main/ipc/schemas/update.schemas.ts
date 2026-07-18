import { z } from 'zod';

/**
 * Update subscription payload schemas. Ported from `isValidUpdateInfo` / `isValidProgress` /
 * `isValidError`. `.passthrough()` preserves any additional emitted fields.
 */

export const updateInfoSchema = z
  .object({
    version: z.string().optional()
  })
  .passthrough();

export const updateProgressSchema = z
  .object({
    percent: z.number().optional()
  })
  .passthrough();

export const updateErrorSchema = z
  .object({
    message: z.string().optional(),
    code: z.string().optional(),
    jobId: z.string().optional(),
    error: z.string().optional()
  })
  .passthrough();
