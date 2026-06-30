import { z } from 'zod';

export const deviceConnectionStateSchema = z.enum([
  'unknown',
  'connected',
  'disconnected',
  'error'
]);

export const deviceInfoSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    manufacturer: z.string().min(1),
    vendorId: z.number(),
    productId: z.number(),
    locationId: z.number().optional(),
    deviceAddress: z.number().optional(),
    serialNumber: z.string().optional()
  })
  .strict();

export const nullableDeviceInfoSchema = deviceInfoSchema.nullish();

export const deviceStatusPayloadSchema = z
  .object({
    state: deviceConnectionStateSchema,
    connected: z.boolean(),
    device: deviceInfoSchema.nullable(),
    error: z.string().optional()
  })
  .strict();

export const deviceStatusResponseSchema = deviceStatusPayloadSchema
  .extend({
    success: z.boolean()
  })
  .strict();
