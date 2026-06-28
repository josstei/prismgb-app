import { z } from 'zod';

/**
 * Shared IPC input primitive schemas. Ported from the generated preload argument validators
 * (`isValidExternalUrl`, the `boolean-argument` validator) so the security guard they provided
 * is preserved at the tRPC `.input(z)` trust boundary.
 */

export const booleanArgumentSchema = z.boolean();

export const externalUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Only http and https URLs are allowed');
