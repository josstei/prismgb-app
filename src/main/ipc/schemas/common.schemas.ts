import { z } from 'zod';

/**
 * Shared IPC input primitive schemas. Ported from the generated preload argument validators
 * (`isValidExternalUrl`, the `boolean-argument` validator) so the security guard they provided
 * is preserved at the tRPC `.input(z)` trust boundary.
 */

/**
 * A boolean "enabled" flag boxed in an object. Scalar IPC inputs are always wrapped in an object
 * (never sent as a bare `boolean`/`number`/`string`): electron-trpc's IPC link drops a falsy input
 * value on the main side (`input ? deserialize(input) : undefined`), turning `mutate(false)` into an
 * `undefined` the schema then rejects. A wrapping object is always truthy, so the flag — `true` or
 * `false` — survives the round-trip. The object contract is also the more extensible tRPC idiom.
 */
export const enabledFlagSchema = z.object({ enabled: z.boolean() });

/**
 * An external-URL input boxed per the scalar-boxing rule above; only http and
 * https URLs pass the trust boundary.
 */
export const externalUrlSchema = z.object({
  url: z
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
    }, 'Only http and https URLs are allowed')
});
