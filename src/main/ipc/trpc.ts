import { initTRPC } from '@trpc/server';
import type { App, Shell } from 'electron';
import type { LoggerLike } from '@platform/core';
import type { DeviceStatus } from '@platform/devices';
import type {
  UpdateStatusPayload,
  TranscodeFormat,
  TranscodeStartResponse,
  TranscodeCancelResponse,
  TranscodeStatusResponse
} from '@platform/ipc';
import type { IpcPushBridge } from './event-bridge.js';
import type { MainProcessTestControlPort } from './test-control.port.js';

export interface DeviceConnectionPort {
  getStatus(): DeviceStatus;
  reconcileDeviceStatus(reason: 'manual-refresh'): Promise<DeviceStatus>;
}

export interface UpdateService {
  checkForUpdates(): Promise<Record<string, unknown>>;
  downloadUpdate(): Promise<void>;
  installUpdate(): void;
  getStatus(): UpdateStatusPayload;
}

export interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
}

export interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export interface TranscodeService {
  transcode(options: {
    inputBuffer: Buffer;
    format: TranscodeFormat;
    outputFilename?: string;
    inputArgs?: string[];
    interrupted: boolean;
  }): Promise<TranscodeStartResponse>;
  cancel(jobId: string): TranscodeCancelResponse;
  getStatus(): TranscodeStatusResponse;
}

/**
 * The dependency set every tRPC procedure resolves against — the same set the retired
 * `IpcHandlerRegistry` injected, plus the {@link IpcPushBridge} the subscription procedures relay
 * from. Supplied per-request by `createIPCHandler`'s `createContext`.
 */
export interface IpcContext {
  deviceConnectionService: DeviceConnectionPort;
  mainProcessTestControl: MainProcessTestControlPort;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  app: App;
  shell: Shell;
  logger: LoggerLike;
  ipcPushBridge: IpcPushBridge;
}

/**
 * An identity transformer (no-op serialize/deserialize) declared explicitly so the renderer's
 * `createTRPCProxyClient` sees a concrete `transformer` on the router config and supplies a matching
 * one. The default transformer is branded `DefaultDataTransformer`, which the renderer's non-strict
 * test tsconfig and the strict app tsconfig resolve inconsistently; an explicit transformer removes
 * that ambiguity. Behaviour is unchanged — the IPC payload is passed through verbatim.
 */
const identityTransformer = {
  serialize: (object: unknown) => object,
  deserialize: (object: unknown) => object
};

const t = initTRPC.context<IpcContext>().create({ transformer: identityTransformer });

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * The single folded replacement for the 15 per-handler `mapError` closures. Runs `run`; on a thrown
 * handler error returns `mapError(error)` — the typed `{ success: false, error }` failure envelope,
 * preserving the current wire shape so renderer consumers that branch on `.success` are unchanged.
 * Validation errors (`.input(z)` / query `.output(z)`) are intentionally NOT caught here — they
 * surface as tRPC errors at the trust boundary.
 */
export async function resultEnvelope<TResult>(
  run: () => TResult | Promise<TResult>,
  mapError: (error: unknown) => TResult
): Promise<TResult> {
  try {
    return await run();
  } catch (error) {
    return mapError(error);
  }
}
