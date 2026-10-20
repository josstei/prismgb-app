import { z } from 'zod';
import { TRANSCODE_FORMATS } from '@platform/ipc';

/**
 * Scalar inputs are boxed in an object: electron-trpc's IPC link drops a falsy input on the main side
 * (`input ? deserialize(input) : undefined`), so a bare `false` would arrive as `undefined`.
 */
export const enabledFlagSchema = z.object({ enabled: z.boolean() });

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

export const transcodeStartSchema = z.object({
  inputBuffer: z.instanceof(ArrayBuffer),
  format: z.enum(TRANSCODE_FORMATS),
  outputFilename: z.string().optional(),
  interrupted: z.boolean().optional()
});
