import type { z } from 'zod';
import { observable } from '@trpc/server/observable';
import {
  IPC_CHANNELS,
  type ProcessMetricsPayload,
  type UpdateInfoPayload,
  type UpdateProgressPayload,
  type UpdateErrorPayload,
  type TranscodeStartPayload,
  type TranscodeProgressPayload,
  type TranscodeCompletedPayload,
  type TranscodeErrorPayload,
  type TranscodeCancelledPayload
} from '@platform/ipc';
import {
  deviceInfoSchema,
  deviceStatusPayloadSchema,
  nullableDeviceInfoSchema,
  toDeviceStatusPayload,
  type DeviceInfoPayload,
  type DeviceStatus,
  type DeviceStatusPayload
} from '@platform/devices';
import { router, procedure, type IpcContext } from './trpc';
import { enabledFlagSchema, externalUrlSchema, transcodeStartSchema } from './ipc.schemas';

/**
 * Relays one IpcPushBridge channel. tRPC 10 applies `.output()` to the resolver's observable rather
 * than to each emitted value, so `validate` runs per payload; an invalid payload is dropped and the
 * stream stays alive.
 */
function pushSubscription<TPayload>(ctx: IpcContext, channel: string, validate?: z.ZodTypeAny) {
  return observable<TPayload>((emit) => {
    const listener = (payload: unknown) => {
      if (!validate) {
        emit.next(payload as TPayload);
        return;
      }
      const result = validate.safeParse(payload);
      if (!result.success) {
        ctx.logger.warn(`Dropping invalid ${channel} subscription payload`);
        return;
      }
      emit.next(result.data as TPayload);
    };
    ctx.ipcPushBridge.on(channel, listener);
    return () => ctx.ipcPushBridge.off(channel, listener);
  });
}

function resolveDeviceStatus(ctx: IpcContext, readStatus: () => DeviceStatus): DeviceStatusPayload {
  const override = ctx.testControl?.deviceStatusOverride;
  if (override) {
    ctx.logger.debug('Using test-control device status override');
    return override;
  }
  return toDeviceStatusPayload(readStatus());
}

const deviceRouter = router({
  getStatus: procedure.output(deviceStatusPayloadSchema).query(({ ctx }) =>
    resolveDeviceStatus(ctx, () => ctx.deviceConnectionService.getStatus())
  ),
  refreshStatus: procedure.output(deviceStatusPayloadSchema).mutation(({ ctx }) =>
    resolveDeviceStatus(ctx, () => ctx.deviceConnectionService.reconcileDeviceStatus('manual-refresh'))
  ),
  onConnected: procedure.subscription(({ ctx }) =>
    pushSubscription<DeviceInfoPayload>(ctx, IPC_CHANNELS.DEVICE.CONNECTED, deviceInfoSchema)
  ),
  onDisconnected: procedure.subscription(({ ctx }) =>
    pushSubscription<DeviceInfoPayload | null | undefined>(ctx, IPC_CHANNELS.DEVICE.DISCONNECTED, nullableDeviceInfoSchema)
  )
});

const shellRouter = router({
  openExternal: procedure.input(externalUrlSchema).mutation(async ({ ctx, input }) => {
    await ctx.shell.openExternal(input.url);
  })
});

const windowRouter = router({
  setFullScreen: procedure.input(enabledFlagSchema).mutation(({ ctx, input }) => {
    ctx.logger.debug(`Setting fullscreen: ${input.enabled}`);
    ctx.windowService.setFullScreen(input.enabled);
  }),
  isFullScreen: procedure.query(({ ctx }) => ({ isFullscreen: ctx.windowService.isFullScreen() })),
  onEnterFullscreen: procedure.subscription(({ ctx }) => pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.ENTER_FULLSCREEN)),
  onLeaveFullscreen: procedure.subscription(({ ctx }) => pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.LEAVE_FULLSCREEN)),
  onResized: procedure.subscription(({ ctx }) => pushSubscription<void>(ctx, IPC_CHANNELS.WINDOW.RESIZED))
});

const updateRouter = router({
  checkForUpdates: procedure.mutation(({ ctx }) => ctx.autoUpdateService.checkForUpdates()),
  downloadUpdate: procedure.mutation(({ ctx }) => ctx.autoUpdateService.downloadUpdate()),
  installUpdate: procedure.mutation(({ ctx }) => {
    ctx.autoUpdateService.installUpdate();
  }),
  getStatus: procedure.query(({ ctx }) => ctx.autoUpdateService.getStatus()),
  onAvailable: procedure.subscription(({ ctx }) => pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.AVAILABLE)),
  onNotAvailable: procedure.subscription(({ ctx }) => pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.NOT_AVAILABLE)),
  onProgress: procedure.subscription(({ ctx }) => pushSubscription<UpdateProgressPayload>(ctx, IPC_CHANNELS.UPDATE.PROGRESS)),
  onDownloaded: procedure.subscription(({ ctx }) => pushSubscription<UpdateInfoPayload>(ctx, IPC_CHANNELS.UPDATE.DOWNLOADED)),
  onError: procedure.subscription(({ ctx }) => pushSubscription<UpdateErrorPayload>(ctx, IPC_CHANNELS.UPDATE.ERROR))
});

const performanceRouter = router({
  getProcessMetrics: procedure.query(({ ctx }): ProcessMetricsPayload => {
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
    };
  })
});

const loginItemRouter = router({
  get: procedure.query(({ ctx }) => ({ enabled: ctx.loginItemService.isEnabled() })),
  set: procedure.input(enabledFlagSchema).mutation(({ ctx, input }) => {
    ctx.logger.debug(`Setting login item: ${input.enabled}`);
    ctx.loginItemService.setEnabled(input.enabled);
  })
});

const transcodeRouter = router({
  start: procedure.input(transcodeStartSchema).mutation(async ({ ctx, input }): Promise<TranscodeStartPayload> => ({
    jobId: await ctx.transcodeService.transcode({
      inputBuffer: Buffer.from(input.inputBuffer),
      format: input.format,
      outputFilename: input.outputFilename,
      interrupted: input.interrupted
    })
  })),
  onProgress: procedure.subscription(({ ctx }) => pushSubscription<TranscodeProgressPayload>(ctx, IPC_CHANNELS.TRANSCODE.PROGRESS)),
  onCompleted: procedure.subscription(({ ctx }) => pushSubscription<TranscodeCompletedPayload>(ctx, IPC_CHANNELS.TRANSCODE.COMPLETED)),
  onError: procedure.subscription(({ ctx }) => pushSubscription<TranscodeErrorPayload>(ctx, IPC_CHANNELS.TRANSCODE.ERROR)),
  onCancelled: procedure.subscription(({ ctx }) => pushSubscription<TranscodeCancelledPayload>(ctx, IPC_CHANNELS.TRANSCODE.CANCELLED))
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
