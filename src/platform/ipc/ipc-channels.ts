import { EventChannels } from '@platform/events';
import type { EventPayloadMap } from '@platform/events';
import type { RendererShutdownRequestPayload } from './push-payloads.schemas.js';

/** Main-to-renderer events; requests are defined only by the tRPC router. */
export const IPC_CHANNELS = {
  APP: { SHUTDOWN_REQUESTED: 'app:shutdown-requested' },
  DEVICE: { CONNECTED: EventChannels.DEVICE.CONNECTED, DISCONNECTED: EventChannels.DEVICE.DISCONNECTED },
  WINDOW: { ENTER_FULLSCREEN: 'window:enter-fullscreen', LEAVE_FULLSCREEN: 'window:leave-fullscreen', RESIZED: 'window:resized' },
  UPDATE: { AVAILABLE: EventChannels.UPDATE.AVAILABLE, NOT_AVAILABLE: EventChannels.UPDATE.NOT_AVAILABLE, PROGRESS: EventChannels.UPDATE.PROGRESS, DOWNLOADED: EventChannels.UPDATE.DOWNLOADED, ERROR: EventChannels.UPDATE.ERROR },
  TRANSCODE: { PROGRESS: EventChannels.TRANSCODE.PROGRESS, COMPLETED: EventChannels.TRANSCODE.COMPLETED, ERROR: EventChannels.TRANSCODE.ERROR, CANCELLED: EventChannels.TRANSCODE.CANCELLED }
} as const;

type PushChannel = { [K in keyof typeof IPC_CHANNELS]: (typeof IPC_CHANNELS)[K][keyof (typeof IPC_CHANNELS)[K]] }[keyof typeof IPC_CHANNELS];
export type IpcPushPayloadMap = {
  [K in PushChannel]: K extends keyof EventPayloadMap ? EventPayloadMap[K]
    : K extends typeof IPC_CHANNELS.APP.SHUTDOWN_REQUESTED ? RendererShutdownRequestPayload : void;
};
export type IpcPushArguments<K extends keyof IpcPushPayloadMap> = undefined extends IpcPushPayloadMap[K]
  ? [channel: K, payload?: IpcPushPayloadMap[K]]
  : [channel: K, payload: IpcPushPayloadMap[K]];
export interface IpcPushPublisher {
  emit<K extends keyof IpcPushPayloadMap>(...args: IpcPushArguments<K>): void;
}
