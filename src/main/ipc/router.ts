import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { IPC_CHANNELS } from '@platform/ipc';
import { toDeviceStatusPayload } from '@platform/devices';
import type {
  DeviceInfoPayload,
  ProcessMetricsPayload,
  UpdateCheckPayload,
  UpdateStatusPayload,
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  TranscodeFormat,
  TranscodeStartPayload,
  TranscodeStatusPayload,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeCancelledPayload
} from '@platform/ipc';

import { router, publicProcedure, rethrowAsTrpcError, type IpcContext } from './trpc.js';
import {
  externalUrlSchema,
  enabledFlagSchema,
  transcodeStartSchema,
  transcodeCancelSchema,
  deviceInfoSchema,
  nullableDeviceInfoSchema,
  updateInfoSchema,
  updateProgressSchema,
  updateErrorSchema,
  transcodeProgressSchema,
  transcodeCompletedSchema,
  transcodeErrorSchema,
  transcodeCancelledSchema,
  loginItemGetResponseSchema,
  deviceStatusPayloadSchema
} from './schemas/index.js';

function toBuffer(inputBuffer: ArrayBuffer): Buffer {
  return Buffer.from(inputBuffer);
}

function toObjectPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Subscription procedure relaying one push channel from the {@link IpcContext.ipcPushBridge}.
 *
 * Trade (b) defense-in-depth: a `schema` validates each payload. Mirroring the retired preload
 * listener (`subscription.factory.ts`), an invalid payload is **dropped and the stream stays alive**
 * (logged), rather than torn down. `schema === null` is a `void` channel (no payload). Validation is
 * performed here rather than via `.output(z)` because tRPC 10 applies output parsers to the resolver
 * return value (the observable), not to each emitted value.
 */
function pushSubscription<TPayload>(ctx: IpcContext, channel: string, schema: z.ZodTypeAny | null, label: string) {
  return observable<TPayload>((emit) => {
    const listener = (payload: unknown) => {
      if (!schema) {
        emit.next(payload as TPayload);
        return;
      }
      const result = schema.safeParse(payload);
      if (!result.success) {
        ctx.logger.warn(`Dropping invalid ${label} subscription payload`);
        return;
      }
      emit.next(result.data as TPayload);
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
      return toDeviceStatusPayload(ctx.deviceConnectionService.getStatus());
    })
  ),
  refreshStatus: publicProcedure.output(deviceStatusPayloadSchema).mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to refresh device status', ctx.logger, async () => {
      const override = ctx.mainProcessTestControl.getDeviceStatusOverride();
      if (override) {
        ctx.logger.debug('Using test-control device refresh status override');
        return override;
      }
      return toDeviceStatusPayload(await ctx.deviceConnectionService.reconcileDeviceStatus('manual-refresh'));
    })
  ),
  onConnected: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<DeviceInfoPayload>(ctx, IPC_CHANNELS.DEVICE.CONNECTED, deviceInfoSchema, 'device-info')
  ),
  onDisconnected: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<DeviceInfoPayload | null | undefined>(ctx, IPC_CHANNELS.DEVICE.DISCONNECTED, nullableDeviceInfoSchema, 'nullable-device-info')
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
    pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN, null, 'window-enter-fullscreen')
  ),
  onLeaveFullscreen: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN, null, 'window-leave-fullscreen')
  ),
  onResized: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.RESIZED, null, 'window-resized')
  )
});

const updateRouter = router({
  checkForUpdates: publicProcedure.mutation(({ ctx }) =>
    rethrowAsTrpcError('Failed to check for updates', ctx.logger, async () => {
      const result = await ctx.updateService.checkForUpdates();
      return toObjectPayload(result) as UpdateCheckPayload;
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
      const status = ctx.updateService.getStatus();
      return toObjectPayload(status) as UpdateStatusPayload;
    })
  ),
  onAvailable: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.AVAILABLE, updateInfoSchema, 'update-info')
  ),
  onNotAvailable: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.NOT_AVAILABLE, updateInfoSchema, 'update-info')
  ),
  onProgress: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<UpdateProgressPayload>(ctx, IPC_CHANNELS.UPDATE.PROGRESS, updateProgressSchema, 'update-progress')
  ),
  onDownloaded: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.DOWNLOADED, updateInfoSchema, 'update-info')
  ),
  onError: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<UpdateErrorPayload>(ctx, IPC_CHANNELS.UPDATE.ERROR, updateErrorSchema, 'update-error')
  )
});

const performanceRouter = router({
  getProcessMetrics: publicProcedure.query(({ ctx }) =>
    rethrowAsTrpcError('Failed to get process metrics', ctx.logger, () => {
      const metrics = ctx.app.getAppMetrics();
      const totalKB = metrics.reduce((sum, proc) => sum + proc.memory.workingSetSize, 0);
      return {
        timestamp: Date.now(),
        totalKB,
        totalMB: (totalKB / 1024).toFixed(1),
        processCount: metrics.length,
        processes: metrics.map((proc) => ({
          type: proc.type,
          pid: proc.pid,
          memoryKB: proc.memory.workingSetSize,
          memoryMB: (proc.memory.workingSetSize / 1024).toFixed(1),
          peakMemoryKB: proc.memory.peakWorkingSetSize,
          peakMemoryMB: (proc.memory.peakWorkingSetSize / 1024).toFixed(1),
          cpuPercent: proc.cpu.percentCPUUsage
        }))
      } as ProcessMetricsPayload;
    })
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
    rethrowAsTrpcError('Failed to start transcode', ctx.logger, async () => {
      const result = await ctx.transcodeService.transcode({
        inputBuffer: toBuffer(input.inputBuffer),
        format: input.format as TranscodeFormat,
        outputFilename: input.outputFilename,
        inputArgs: input.inputArgs,
        interrupted: Boolean(input.interrupted)
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to start transcode');
      }
      const { jobId, filePath } = result;
      return { jobId, filePath } as TranscodeStartPayload;
    })
  ),
  cancel: publicProcedure.input(transcodeCancelSchema).mutation(({ ctx, input }) =>
    rethrowAsTrpcError('Failed to cancel transcode', ctx.logger, () => {
      const result = ctx.transcodeService.cancel(input.jobId);
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to cancel transcode');
      }
    })
  ),
  getStatus: publicProcedure.query(({ ctx }) =>
    rethrowAsTrpcError('Failed to get transcode status', ctx.logger, () => {
      const result = ctx.transcodeService.getStatus();
      if (!result.success) {
        throw new Error(result.error ?? 'Failed to get transcode status');
      }
      return { jobs: result.jobs ?? [] } as TranscodeStatusPayload;
    })
  ),
  onProgress: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<TranscodeProgressPayload>(ctx, IPC_CHANNELS.TRANSCODE.PROGRESS, transcodeProgressSchema, 'transcode-progress')
  ),
  onCompleted: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<TranscodeCompletedPayload>(ctx, IPC_CHANNELS.TRANSCODE.COMPLETED, transcodeCompletedSchema, 'transcode-completed')
  ),
  onError: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<TranscodeErrorPayload>(ctx, IPC_CHANNELS.TRANSCODE.ERROR, transcodeErrorSchema, 'transcode-error')
  ),
  onCancelled: publicProcedure.subscription(({ ctx }) =>
    pushSubscription<TranscodeCancelledPayload>(ctx, IPC_CHANNELS.TRANSCODE.CANCELLED, transcodeCancelledSchema, 'transcode-cancelled')
  )
});

export const appRouter = router({
  device: deviceRouter,
  shell: shellRouter,
  window: windowRouter,
  update: updateRouter,
  performance: performanceRouter,
  loginItem: loginItemRouter,
  transcode: transcodeRouter
});

export type AppRouter = typeof appRouter;
