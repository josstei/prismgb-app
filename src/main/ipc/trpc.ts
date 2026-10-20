import { initTRPC, TRPCError } from '@trpc/server';
import type { App, Shell } from 'electron';
import { getErrorMessage } from '@platform/core';
import type { Logger } from '@platform/core';
import type { DeviceStatus } from '@platform/devices';
import type { TranscodeFormat } from '@platform/ipc';
import type { TranscodeResult, CancelResult, StatusResult } from '@platform/transcode/service';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { IpcPushBridge } from './ipc-push.bridge';
import type { MainProcessTestControlPort } from './test-control.port';

export interface DeviceConnectionPort {
  getStatus(): DeviceStatus;
  reconcileDeviceStatus(reason: 'manual-refresh'): Promise<DeviceStatus>;
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
  }): Promise<TranscodeResult>;
  cancel(jobId: string): CancelResult;
  getStatus(): StatusResult;
}

/**
 * The dependency set every tRPC procedure resolves against, plus the {@link IpcPushBridge} the
 * subscription procedures relay from. Supplied per-request by `createIPCHandler`'s `createContext`.
 */
export interface IpcContext {
  deviceConnectionService: DeviceConnectionPort;
  mainProcessTestControl: MainProcessTestControlPort;
  autoUpdateService: AutoUpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  app: App;
  shell: Shell;
  logger: Logger;
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
 * The single folded replacement for the 14 per-handler `mapError` closures the hand-built
 * `{ success: false, error }` envelope required. Runs `run`; on a thrown handler error, logs
 * `label` with the original error (preserving today's main-process log lines) and rethrows an
 * `INTERNAL_SERVER_ERROR` {@link TRPCError} carrying the original error's message — electron-trpc
 * propagates both the code and the message to the renderer's `TRPCClientError`, so failure-string
 * parity holds without an enumerated taxonomy (YAGNI: the envelopes only ever carried a message).
 * Validation errors (`.input(z)` / query `.output(z)`) are intentionally NOT caught here — they
 * surface as tRPC errors at the trust boundary, same as before.
 */
export async function rethrowAsTrpcError<TResult>(
  label: string,
  logger: Logger,
  run: () => TResult | Promise<TResult>
): Promise<TResult> {
  try {
    return await run();
  } catch (error) {
    logger.error(label, error);
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: getErrorMessage(error) });
  }
}
