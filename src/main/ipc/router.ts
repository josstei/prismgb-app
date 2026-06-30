import { z } from 'zod';
import { observable } from '@trpc/server/observable';
import { IPC_CHANNELS } from '@prismgb/ipc';
import { toDeviceStatusPayload } from '@prismgb/devices';
import type {
  DeviceStatusResponse,
  DeviceInfoPayload,
  ShellOpenExternalResponse,
  WindowSetFullscreenResponse,
  WindowIsFullscreenResponse,
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateInstallResponse,
  UpdateGetStatusResponse,
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  ProcessMetricsResponse,
  LoginItemSetResponse,
  TranscodeFormat,
  TranscodeStartResponse,
  TranscodeCancelResponse,
  TranscodeStatusResponse,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeCancelledPayload
} from '@prismgb/ipc';
import { getGpuPolicy } from '@main/infrastructure/gpu-policy.js';
import { router, publicProcedure, resultEnvelope, type IpcContext } from './trpc.js';
import {
  externalUrlSchema,
  booleanArgumentSchema,
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
  gpuPolicyResponseSchema,
  loginItemGetResponseSchema,
  deviceStatusResponseSchema
} from './schemas/index.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

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
  getStatus: publicProcedure.output(deviceStatusResponseSchema).query(({ ctx }) =>
    resultEnvelope<DeviceStatusResponse>(
      () => {
        const override = ctx.mainProcessTestControl.getDeviceStatusOverride();
        if (override) {
          ctx.logger.debug('Using test-control device status override');
          return { success: true, ...override };
        }
        return { success: true, ...toDeviceStatusPayload(ctx.mainDeviceRuntime.getStatus()) };
      },
      (error) => {
        ctx.logger.error('Failed to get device status:', error);
        return {
          success: false,
          state: 'error',
          connected: false,
          device: null,
          error: errorMessage(error)
        };
      }
    )
  ),
  refreshStatus: publicProcedure.output(deviceStatusResponseSchema).mutation(({ ctx }) =>
    resultEnvelope<DeviceStatusResponse>(
      async () => {
        const override = ctx.mainProcessTestControl.getDeviceStatusOverride();
        if (override) {
          ctx.logger.debug('Using test-control device refresh status override');
          return { success: true, ...override };
        }
        return { success: true, ...toDeviceStatusPayload(await ctx.mainDeviceRuntime.reconcileDeviceStatus('manual-refresh')) };
      },
      (error) => {
        ctx.logger.error('Failed to refresh device status:', error);
        return {
          success: false,
          state: 'error',
          connected: false,
          device: null,
          error: errorMessage(error)
        };
      }
    )
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
    resultEnvelope<ShellOpenExternalResponse>(
      async () => {
        await ctx.shell.openExternal(input);
        return { success: true } as ShellOpenExternalResponse;
      },
      (error) => {
        ctx.logger.error('Failed to open external URL:', error);
        return { success: false, error: errorMessage(error) } as ShellOpenExternalResponse;
      }
    )
  )
});

const windowRouter = router({
  setFullScreen: publicProcedure.input(booleanArgumentSchema).mutation(({ ctx, input }) =>
    resultEnvelope<WindowSetFullscreenResponse>(
      () => {
        ctx.logger.debug(`Setting fullscreen: ${input}`);
        ctx.windowService.setFullScreen(input);
        return { success: true } as WindowSetFullscreenResponse;
      },
      (error) => {
        ctx.logger.error('Failed to set fullscreen:', error);
        return { success: false, error: errorMessage(error) } as WindowSetFullscreenResponse;
      }
    )
  ),
  isFullScreen: publicProcedure.query(({ ctx }) =>
    resultEnvelope<WindowIsFullscreenResponse>(
      () => ({ success: true, isFullscreen: ctx.windowService.isFullScreen() } as WindowIsFullscreenResponse),
      (error) => {
        ctx.logger.error('Failed to get fullscreen state:', error);
        return { success: false, isFullscreen: false, error: errorMessage(error) } as WindowIsFullscreenResponse;
      }
    )
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
    resultEnvelope<UpdateCheckResponse>(
      async () => {
        const result = await ctx.updateService.checkForUpdates();
        return { success: true, ...toObjectPayload(result) } as UpdateCheckResponse;
      },
      (error) => {
        ctx.logger.error('Failed to check for updates:', error);
        return { success: false, error: errorMessage(error) } as UpdateCheckResponse;
      }
    )
  ),
  downloadUpdate: publicProcedure.mutation(({ ctx }) =>
    resultEnvelope<UpdateDownloadResponse>(
      async () => {
        await ctx.updateService.downloadUpdate();
        return { success: true } as UpdateDownloadResponse;
      },
      (error) => {
        ctx.logger.error('Failed to download update:', error);
        return { success: false, error: errorMessage(error) } as UpdateDownloadResponse;
      }
    )
  ),
  installUpdate: publicProcedure.mutation(({ ctx }) =>
    resultEnvelope<UpdateInstallResponse>(
      () => {
        ctx.updateService.installUpdate();
        return { success: true } as UpdateInstallResponse;
      },
      (error) => {
        ctx.logger.error('Failed to install update:', error);
        return { success: false, error: errorMessage(error) } as UpdateInstallResponse;
      }
    )
  ),
  getStatus: publicProcedure.query(({ ctx }) =>
    resultEnvelope<UpdateGetStatusResponse>(
      () => {
        const status = ctx.updateService.getStatus();
        return { success: true, ...toObjectPayload(status) } as UpdateGetStatusResponse;
      },
      (error) => {
        ctx.logger.error('Failed to get update status:', error);
        return { success: false, error: errorMessage(error) } as UpdateGetStatusResponse;
      }
    )
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
    resultEnvelope<ProcessMetricsResponse>(
      () => {
        const metrics = ctx.app.getAppMetrics();
        const totalKB = metrics.reduce((sum, proc) => sum + proc.memory.workingSetSize, 0);
        return {
          success: true,
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
        } as ProcessMetricsResponse;
      },
      (error) => {
        ctx.logger.error('Failed to get process metrics:', error);
        return { success: false, error: errorMessage(error) } as ProcessMetricsResponse;
      }
    )
  )
});

const gpuRouter = router({
  getPolicy: publicProcedure.output(gpuPolicyResponseSchema).query(({ ctx }) => {
    const policy = getGpuPolicy();
    ctx.logger.debug('Resolved GPU policy');
    return { success: true as const, skipWebGPU: policy.skipWebGPU, reason: policy.reason };
  })
});

const loginItemRouter = router({
  get: publicProcedure.output(loginItemGetResponseSchema).query(({ ctx }) => {
    return { success: true as const, enabled: ctx.loginItemService.isEnabled() };
  }),
  set: publicProcedure.input(booleanArgumentSchema).mutation(({ ctx, input }) =>
    resultEnvelope<LoginItemSetResponse>(
      () => {
        ctx.logger.debug(`Setting login item: ${input}`);
        ctx.loginItemService.setEnabled(input);
        return { success: true } as LoginItemSetResponse;
      },
      (error) => {
        ctx.logger.error('Failed to set login item:', error);
        return { success: false, error: errorMessage(error) } as LoginItemSetResponse;
      }
    )
  )
});

const transcodeRouter = router({
  start: publicProcedure.input(transcodeStartSchema).mutation(({ ctx, input }) =>
    resultEnvelope<TranscodeStartResponse>(
      () =>
        ctx.transcodeService.transcode({
          inputBuffer: toBuffer(input.inputBuffer),
          format: input.format as TranscodeFormat,
          outputFilename: input.outputFilename,
          inputArgs: input.inputArgs,
          interrupted: Boolean(input.interrupted)
        }),
      (error) => {
        ctx.logger.error('Failed to start transcode:', error);
        return { success: false, error: errorMessage(error) } as TranscodeStartResponse;
      }
    )
  ),
  cancel: publicProcedure.input(transcodeCancelSchema).mutation(({ ctx, input }) =>
    resultEnvelope<TranscodeCancelResponse>(
      () => ctx.transcodeService.cancel(input.jobId),
      (error) => {
        ctx.logger.error('Failed to cancel transcode:', error);
        return { success: false, error: errorMessage(error) } as TranscodeCancelResponse;
      }
    )
  ),
  getStatus: publicProcedure.query(({ ctx }) =>
    resultEnvelope<TranscodeStatusResponse>(
      () => ctx.transcodeService.getStatus(),
      (error) => {
        ctx.logger.error('Failed to get transcode status:', error);
        return { success: false, error: errorMessage(error) } as TranscodeStatusResponse;
      }
    )
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
  gpu: gpuRouter,
  loginItem: loginItemRouter,
  transcode: transcodeRouter
});

export type AppRouter = typeof appRouter;
