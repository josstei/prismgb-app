import { initTRPC, TRPCError } from '@trpc/server';
import { ipcTransformer } from '@platform/ipc';
import type { Shell } from 'electron';
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
 * Per-request dependencies supplied by IpcHandlerRegistry through createIPCHandler.
 */
export interface IpcContext {
  deviceConnectionService: DeviceConnectionPort;
  mainProcessTestControl: MainProcessTestControlPort;
  updateService: UpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
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
 * Log service failures and preserve their messages in renderer-visible tRPC errors.
 * Input and output validation run outside this service error boundary.
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
