import { z } from 'zod';
import { EventChannels } from '@platform/events';
import { deviceInfoSchema, nullableDeviceInfoSchema } from '@platform/devices';
import {
  rendererShutdownRequestSchema, updateInfoSchema, updateProgressSchema, updateErrorSchema,
  transcodeProgressSchema, transcodeCompletedSchema, transcodeErrorSchema, transcodeCancelledSchema
} from './push-payloads.schemas.js';

const push = <const TChannel extends string, TSchema extends z.ZodType>(channel: TChannel, schema: TSchema) => ({ channel, schema });

/** Main-to-renderer events; requests are defined only by the tRPC router. */
const definitions = {
  APP: { SHUTDOWN_REQUESTED: push('app:shutdown-requested', rendererShutdownRequestSchema) },
  DEVICE: { CONNECTED: push(EventChannels.DEVICE.CONNECTED, deviceInfoSchema), DISCONNECTED: push(EventChannels.DEVICE.DISCONNECTED, nullableDeviceInfoSchema) },
  WINDOW: { ENTER_FULLSCREEN: push('window:enter-fullscreen', z.void()), LEAVE_FULLSCREEN: push('window:leave-fullscreen', z.void()), RESIZED: push('window:resized', z.void()) },
  UPDATE: { AVAILABLE: push(EventChannels.UPDATE.AVAILABLE, updateInfoSchema), NOT_AVAILABLE: push(EventChannels.UPDATE.NOT_AVAILABLE, updateInfoSchema), PROGRESS: push(EventChannels.UPDATE.PROGRESS, updateProgressSchema), DOWNLOADED: push(EventChannels.UPDATE.DOWNLOADED, updateInfoSchema), ERROR: push(EventChannels.UPDATE.ERROR, updateErrorSchema) },
  TRANSCODE: { PROGRESS: push(EventChannels.TRANSCODE.PROGRESS, transcodeProgressSchema), COMPLETED: push(EventChannels.TRANSCODE.COMPLETED, transcodeCompletedSchema), ERROR: push(EventChannels.TRANSCODE.ERROR, transcodeErrorSchema), CANCELLED: push(EventChannels.TRANSCODE.CANCELLED, transcodeCancelledSchema) }
} as const;

type Definitions = typeof definitions;
type PushDefinition = { [TGroup in keyof Definitions]: Definitions[TGroup][keyof Definitions[TGroup]] }[keyof Definitions];

export const IPC_CHANNELS = Object.fromEntries(Object.entries(definitions).map(([group, entries]) => [
  group, Object.fromEntries(Object.entries(entries).map(([name, entry]) => [name, entry.channel]))
])) as { readonly [TGroup in keyof Definitions]: { readonly [TName in keyof Definitions[TGroup]]: Definitions[TGroup][TName] extends { channel: infer TChannel } ? TChannel : never } };

type PushPayload<TSchema extends z.ZodType> = TSchema extends z.ZodObject
  ? Pick<z.output<TSchema>, keyof TSchema['shape']> : z.output<TSchema>;
export type IpcPushPayloadMap = { [TDefinition in PushDefinition as TDefinition['channel']]: PushPayload<TDefinition['schema']> };

export const ipcPushSchemas = Object.fromEntries(Object.values(definitions).flatMap((group) =>
  Object.values(group).map(({ channel, schema }) => [channel, schema])
)) as { [TChannel in keyof IpcPushPayloadMap]: z.ZodType<IpcPushPayloadMap[TChannel]> };
export type IpcPushArguments<K extends keyof IpcPushPayloadMap> = undefined extends IpcPushPayloadMap[K]
  ? [channel: K, payload?: IpcPushPayloadMap[K]]
  : [channel: K, payload: IpcPushPayloadMap[K]];
export interface IpcPushPublisher {
  emit<K extends keyof IpcPushPayloadMap>(...args: IpcPushArguments<K>): void;
}
