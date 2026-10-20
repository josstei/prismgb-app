/**
 * Security `.input(z)` schemas and defense-in-depth `.output(z)` payload schemas for the tRPC router.
 */

export { enabledFlagSchema, externalUrlSchema } from './common.schemas';
export {
  deviceInfoSchema,
  nullableDeviceInfoSchema,
  deviceStatusPayloadSchema
} from '@platform/devices';
export { updateInfoSchema, updateProgressSchema, updateErrorSchema } from './update.schemas';
export {
  transcodeStartSchema,
  transcodeCancelSchema,
  transcodeProgressSchema,
  transcodeCompletedSchema,
  transcodeErrorSchema,
  transcodeCancelledSchema
} from './transcode.schemas';
export { loginItemGetResponseSchema } from './login-item.schemas';
