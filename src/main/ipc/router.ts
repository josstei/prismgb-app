import type { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { IPC_CHANNELS, ipcPushSchemas, type IpcPushPayloadMap } from '@platform/ipc';

import { router, publicProcedure, rethrowAsTrpcError, type IpcContext } from './trpc.js';
import { rendererShutdownResultSchema } from './schemas/app.schemas.js';
import { externalUrlSchema, enabledFlagSchema, localBlobDownloadSchema } from './schemas/common.schemas.js';
import { transcodeStartSchema, transcodeCancelSchema } from './schemas/transcode.schemas.js';
import { loginItemGetResponseSchema } from './schemas/login-item.schemas.js';
import { deviceStatusPayloadSchema } from '@platform/devices';

/** Validate emitted values without tearing down a subscription after a malformed push. */
function pushSubscription<TChannel extends keyof IpcPushPayloadMap>(ctx: IpcContext, channel: TChannel) {
  const schema: z.ZodType<IpcPushPayloadMap[TChannel]> = ipcPushSchemas[channel];
  return observable<IpcPushPayloadMap[TChannel]>((emit) => {
    const listener = (payload: unknown) => {
      const result = schema.safeParse(payload);
      if (!result.success) {
        ctx.logger.warn(`Dropping invalid ${channel} subscription payload`);
        return;
      }
      emit.next(result.data);
    };
    ctx.ipcPushBridge.on(channel, listener);
    return () => ctx.ipcPushBridge.off(channel, listener);
  });
}

const deviceRouter = router({
  getStatus: publicProcedure.output(deviceStatusPayloadSchema).query(({ ctx }) =>
    rethrowAsTrpcError('Failed to get device status', ctx.logger, () => {
      const override = ctx.mainProcessTestControl.getDeviceStatusOverride();
      if (override) {
        ctx.logger.debug('Using test-control device status override');
        return override;
      }
      return ctx.deviceConnectionService.getStatus();
    })
  ),
  refreshStatus: publicProcedure.output(deviceStatusPayloadSchema).mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to refresh device status', ctx.logger, async () => {
      const override = ctx.mainProcessTestControl.getDeviceStatusOverride();
      if (override) {
        ctx.logger.debug('Using test-control device refresh status override');
        return override;
      }
      return ctx.deviceConnectionService.reconcileDeviceStatus('manual-refresh');
    })
  ),
  onConnected: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.DEVICE.CONNECTED)
  ),
  onDisconnected: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.DEVICE.DISCONNECTED)
  )
});

const shellRouter = router({
  openExternal: publicProcedure.input(externalUrlSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to open external URL', ctx.logger, async () => {
      await ctx.shell.openExternal(input.url);
    })
  )
});

const windowRouter = router({
  expectDownload: publicProcedure.input(localBlobDownloadSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to register download', ctx.logger, () => ctx.windowService.expectDownload(input.url))
  ),
  cancelDownload: publicProcedure.input(localBlobDownloadSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to cancel download registration', ctx.logger, () => ctx.windowService.cancelDownload(input.url))
  ),
  setFullScreen: publicProcedure.input(enabledFlagSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to set fullscreen', ctx.logger, () => {
      ctx.logger.debug(`Setting fullscreen: ${input.enabled}`);
      ctx.windowService.setFullScreen(input.enabled);
    })
  ),
  isFullScreen: publicProcedure.query(({ ctx }) =>
    rethrowAsTrpcError('Failed to get fullscreen state', ctx.logger, () => ({
      isFullscreen: ctx.windowService.isFullScreen()
    }))
  ),
  onEnterFullscreen: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN)
  ),
  onLeaveFullscreen: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN)
  ),
  onResized: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.WINDOW.RESIZED)
  )
});

const updateRouter = router({
  checkForUpdates: publicProcedure.mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to check for updates', ctx.logger, async () => {
      return ctx.updateService.checkForUpdates();
    })
  ),
  downloadUpdate: publicProcedure.mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to download update', ctx.logger, async () => {
      await ctx.updateService.downloadUpdate();
    })
  ),
  installUpdate: publicProcedure.mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to install update', ctx.logger, () => {
      ctx.updateService.installUpdate();
    })
  ),
  getStatus: publicProcedure.query(({ ctx }) =>
    rethrowAsTrpcError('Failed to get update status', ctx.logger, () => {
      return ctx.updateService.getStatus();
    })
  ),
  onAvailable: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.UPDATE.AVAILABLE)
  ),
  onNotAvailable: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.UPDATE.NOT_AVAILABLE)
  ),
  onProgress: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.UPDATE.PROGRESS)
  ),
  onDownloaded: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.UPDATE.DOWNLOADED)
  ),
  onError: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.UPDATE.ERROR)
  )
});

const loginItemRouter = router({
  get: publicProcedure.output(loginItemGetResponseSchema).query(({ ctx }) => {
    return { enabled: ctx.loginItemService.isEnabled() };
  }),
  set: publicProcedure.input(enabledFlagSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to set login item', ctx.logger, () => {
      ctx.logger.debug(`Setting login item: ${input.enabled}`);
      ctx.loginItemService.setEnabled(input.enabled);
    })
  )
});

const transcodeRouter = router({
  start: publicProcedure.input(transcodeStartSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to start transcode', ctx.logger, () =>
      ctx.transcodeService.transcode({
        inputBuffer: Buffer.from(input.inputBuffer),
        format: input.format,
        outputFilename: input.outputFilename ?? '',
        ...(input.inputArgs ? { inputArgs: input.inputArgs } : {})
      })
    )
  ),
  cancel: publicProcedure.input(transcodeCancelSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to cancel transcode', ctx.logger, () => ctx.transcodeService.cancel(input.jobId))
  ),
  onProgress: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.TRANSCODE.PROGRESS)
  ),
  onCompleted: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.TRANSCODE.COMPLETED)
  ),
  onError: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.TRANSCODE.ERROR)
  ),
  onCancelled: publicProcedure.subscription(({ ctx }) =>
    pushSubscription(ctx, IPC_CHANNELS.TRANSCODE.CANCELLED)
  )
});

export const appRouter = router({
  app: router({
    rendererReady: publicProcedure.mutation(({ ctx }) => ctx.onRendererReady()),
    onShutdown: publicProcedure.subscription(({ ctx }) =>
      pushSubscription(ctx, IPC_CHANNELS.APP.SHUTDOWN_REQUESTED)
    ),
    rendererShutdownComplete: publicProcedure.input(rendererShutdownResultSchema).mutation(({ ctx, input }) =>
      ctx.onRendererShutdownComplete(input)
    )
  }),
  device: deviceRouter,
  shell: shellRouter,
  window: windowRouter,
  update: updateRouter,
  loginItem: loginItemRouter,
  transcode: transcodeRouter
});

export type AppRouter = typeof appRouter;
