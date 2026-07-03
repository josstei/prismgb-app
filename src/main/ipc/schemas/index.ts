/**
 * IPC Zod schema barrel.
 * Security `.input(z)` schemas and defense-in-depth `.output(z)` payload schemas for the tRPC router,
 * ported from the (now retired) generated preload validators.
 */

export { booleanArgumentSchema, externalUrlSchema } from './common.schemas.js';
export {
  deviceInfoSchema,
  nullableDeviceInfoSchema,
  deviceStatusPayloadSchema
} from './device.schemas.js';
export { updateInfoSchema, updateProgressSchema, updateErrorSchema } from './update.schemas.js';
export {
  transcodeStartSchema,
  transcodeCancelSchema,
  transcodeProgressSchema,
  transcodeCompletedSchema,
  transcodeErrorSchema,
  transcodeCancelledSchema
} from './transcode.schemas.js';
export { loginItemGetResponseSchema } from './login-item.schemas.js';
