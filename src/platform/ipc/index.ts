export { IPC_CHANNELS } from './ipc-channels.js';
export type { IpcPushPublisher, IpcPushPayloadMap, IpcPushArguments } from './ipc-channels.js';
export type {
  DeviceStatusPayload,
  UpdateStatusPayload,
  UpdateCheckPayload,
  TranscodeFormat,
  TranscodeStartOptions,
  TranscodeStartPayload
} from './ipc-payloads.contract.js';

export { rendererShutdownRequestSchema, updateInfoSchema, updateProgressSchema, updateErrorSchema, transcodeProgressSchema, transcodeCompletedSchema, transcodeErrorSchema, transcodeCancelledSchema } from './push-payloads.schemas.js';
export type { UpdateInfoPayload, UpdateProgressPayload, UpdateErrorPayload, TranscodeProgressPayload, TranscodeCompletedPayload, TranscodeCancelledPayload, TranscodeErrorPayload } from './push-payloads.schemas.js';

/** Electron carries structured-clone values; retain their types instead of tRPC's JSON output mapping. */
export const ipcTransformer = {
  serialize: (value: unknown) => value,
  deserialize: (value: unknown) => value
};
