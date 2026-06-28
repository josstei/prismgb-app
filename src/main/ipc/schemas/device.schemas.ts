import { z } from 'zod';

/**
 * Device subscription payload schemas. Ported from `isValidDeviceInfo` / `isValidNullableDeviceInfo`:
 * an object whose enumerated fields, when present, carry the expected primitive type. `.passthrough()`
 * preserves any additional fields the emitter sends (the original validators never stripped unknowns).
 */

export const deviceInfoSchema = z
  .object({
    locationId: z.number().optional(),
    vendorId: z.number().optional(),
    productId: z.number().optional(),
    deviceAddress: z.number().optional(),
    deviceName: z.string().optional(),
    manufacturer: z.string().optional(),
    serialNumber: z.string().optional(),
    configName: z.string().optional()
  })
  .passthrough();

export const nullableDeviceInfoSchema = deviceInfoSchema.nullish();
