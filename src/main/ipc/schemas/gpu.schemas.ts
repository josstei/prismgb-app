import { z } from 'zod';

/**
 * GPU policy query-output schema (trade e). Validates the success-shape `getGpuPolicy` response
 * (ported from `isValidGpuPolicy`). A `{ success: false }` failure envelope fails this `.output(z)`
 * and surfaces as an error, which the `capability-detector` consumer maps to its UA fallback —
 * restoring the graceful-fallback contract the preload `responsePolicy` guard provided.
 */

export const gpuPolicyResponseSchema = z
  .object({
    success: z.literal(true),
    skipWebGPU: z.boolean(),
    reason: z.string().nullable()
  })
  .passthrough();
