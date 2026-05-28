export { IPC_CHANNELS, IpcContractManifest } from './ipc.manifest.js';
export type { IpcChannels } from './ipc.manifest.js';
export type {
  IpcActionResult,
  DeviceInfoPayload as IpcDeviceInfoPayload,
  DeviceStatusPayload,
  UpdateInfoPayload as IpcUpdateInfoPayload,
  UpdateProgressPayload as IpcUpdateProgressPayload,
  UpdateErrorPayload as IpcUpdateErrorPayload,
  UpdateStatusPayload,
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateInstallResponse,
  UpdateGetStatusResponse,
  TranscodeFormat,
  TranscodeStartOptions,
  TranscodeJobPayload,
  TranscodeProgressPayload as IpcTranscodeProgressPayload,
  TranscodeCompletedPayload as IpcTranscodeCompletedPayload,
  TranscodeCancelledPayload as IpcTranscodeCancelledPayload,
  TranscodeErrorPayload as IpcTranscodeErrorPayload,
  TranscodeStartResponse,
  TranscodeCancelResponse,
  TranscodeStatusResponse
} from './preload-api.contract.js';

export {
  defineIpcHandlers,
  defineManifestIpcHandlers,
  defineIpcHandlerRegistrationGroup,
  registerIpcHandlerDescriptors,
  registerIpcHandlerRegistrationGroups
} from './ipc-handler.descriptor.js';
export type {
  RegisterHandler,
  IpcHandlerResponseMode,
  IpcHandlerDescriptor,
  IpcHandlerRegistrationGroup
} from './ipc-handler.descriptor.js';
