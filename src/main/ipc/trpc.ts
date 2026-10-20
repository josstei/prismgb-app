import { initTRPC } from '@trpc/server';
import type { App, Shell } from 'electron';
import type { Logger } from '@platform/core';
import { identityTransformer } from '@platform/ipc';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';
import type { IpcPushBridge } from './ipc-push.bridge';
import type { TestControl } from './test-control';

export interface IpcContext {
  deviceConnectionService: DeviceConnectionService;
  autoUpdateService: AutoUpdateService;
  windowService: WindowService;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
  app: App;
  shell: Shell;
  logger: Logger;
  ipcPushBridge: IpcPushBridge;
  testControl: TestControl | null;
}

const t = initTRPC.context<IpcContext>().create({ transformer: identityTransformer });

export const router = t.router;

/**
 * tRPC wraps a thrown handler error as INTERNAL_SERVER_ERROR carrying its message, which the renderer
 * surfaces verbatim; input validation fails as BAD_REQUEST and is deliberately not logged.
 */
export const procedure = t.procedure.use(async ({ ctx, path, next }) => {
  const result = await next();
  if ('error' in result && result.error.code === 'INTERNAL_SERVER_ERROR') {
    ctx.logger.error(`IPC ${path} failed`, result.error.cause ?? result.error);
  }
  return result;
});
