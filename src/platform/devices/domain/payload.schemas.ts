import { z } from 'zod';
import type { DeviceInfoPayload, DeviceStatusPayload } from './types.js';

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

/**
 * Compile-time drift guards: the schema output shape and the canonical
 * `DeviceInfoPayload`/`DeviceStatusPayload` types must stay assignable. A
 * retyped field fails every typecheck config; added/removed fields fail the
 * strict app config. The Partial direction is required because zod inference
 * collapses to all-optional under configs with strictNullChecks disabled
 * (verified: `tsconfig.test.json` sets `strictNullChecks: false`, so a direct
 * `z.infer` export would silently widen every field to optional there).
 */
type AssertAssignable<A extends B, B> = A;

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

/**
 * Compile-time drift guard between the zod schema and the shared payload type.
 * @public
 */
export type DeviceInfoSchemaDriftGuard = AssertAssignable<z.infer<typeof deviceInfoSchema>, DeepPartial<DeviceInfoPayload>>;
/**
 * Compile-time drift guard between the zod schema and the shared payload type.
 * @public
 */
export type DeviceInfoPayloadDriftGuard = AssertAssignable<DeviceInfoPayload, z.infer<typeof deviceInfoSchema>>;
/**
 * Compile-time drift guard between the zod schema and the shared payload type.
 * @public
 */
export type DeviceStatusSchemaDriftGuard = AssertAssignable<z.infer<typeof deviceStatusPayloadSchema>, DeepPartial<DeviceStatusPayload>>;
/**
 * Compile-time drift guard between the zod schema and the shared payload type.
 * @public
 */
export type DeviceStatusPayloadDriftGuard = AssertAssignable<DeviceStatusPayload, z.infer<typeof deviceStatusPayloadSchema>>;
