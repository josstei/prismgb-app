import { initTRPC, TRPCError } from '@trpc/server';
import { ipcTransformer } from '@platform/ipc';
import type { App, Shell } from 'electron';
import { getErrorMessage } from '@platform/core';
import type { LoggerLike } from '@platform/core';
import type { DeviceStatus } from '@platform/devices';
import type { TranscodeService as PlatformTranscodeService } from '@platform/transcode/service';
import type { UpdateService as PlatformUpdateService } from '@platform/updates';
import type { IpcPushBridge } from './ipc-push.bridge.js';
import type { MainProcessTestControlPort } from './test-control.port.js';
import type { RendererShutdownResult } from './schemas/app.schemas.js';

export interface DeviceConnectionPort {
  getStatus(): DeviceStatus;
  reconcileDeviceStatus(reason: 'manual-refresh'): Promise<DeviceStatus>;
}

export type UpdateService = Pick<PlatformUpdateService, 'checkForUpdates' | 'downloadUpdate' | 'installUpdate' | 'getStatus'>;

export interface WindowService {
  setFullScreen(enabled: boolean): void;
  isFullScreen(): boolean;
  expectDownload(url: string): void;
  cancelDownload(url: string): void;
}

export interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

export type TranscodeService = Pick<PlatformTranscodeService, 'transcode' | 'cancel'>;

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
  onRendererReady: () => void;
  onRendererShutdownComplete: (result: RendererShutdownResult) => void;
}

const t = initTRPC.context<IpcContext>().create({ transformer: ipcTransformer });

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
  logger: LoggerLike,
  run: () => TResult | Promise<TResult>
): Promise<TResult> {
  try {
    return await run();
  } catch (error) {
    logger.error(label, error);
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: getErrorMessage(error) });
  }
}
