import { z } from 'zod';

/**
 * Login-item get query-output schema (trade e), defense-in-depth only: `get` has no failure path of
 * its own, so the schema validates the payload shape rather than a success/error envelope. A thrown
 * handler error now surfaces as a tRPC error at the trust boundary instead of failing this parser.
 */

export const loginItemGetResponseSchema = z
  .object({
    enabled: z.boolean()
  })
  .strict();
