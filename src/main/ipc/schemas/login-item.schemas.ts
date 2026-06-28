import { z } from 'zod';

/**
 * Login-item get query-output schema (trade e). Validates the success-shape response; a
 * `{ success: false }` failure envelope fails this `.output(z)` and surfaces as an error, which the
 * settings consumer already handles via its try/catch → stored-value fallback.
 */

export const loginItemGetResponseSchema = z
  .object({
    success: z.literal(true),
    enabled: z.boolean()
  })
  .passthrough();
