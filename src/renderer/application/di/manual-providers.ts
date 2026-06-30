import type { LoggerFactoryLike } from '@prismgb/core';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { BrowserStorageAdapter } from '../../infrastructure/browser/browser-storage.adapter';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';
import { StreamingCanvasRenderLoopService } from '@renderer/infrastructure/services/streaming/canvas-render-loop.service';
import { StreamingRendererFactory } from '@renderer/infrastructure/services/streaming/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from '@renderer/infrastructure/services/streaming/adapters/streaming-gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from '@renderer/infrastructure/services/streaming/adapters/streaming-canvas2d-renderer.adapter';
import {
  BrowserMediaDevicesPort,
  StorageDevicePreferenceStore,
  TrpcDeviceStatusPort
} from '../../infrastructure/services/devices/device-platform.adapters';
import { UIComponentRegistry } from '../../presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from '../../presentation/controller/ui-component.catalog';

/** Resolver handed to each provider so it can pull already-registered tokens. */
export type ResolveFn = <T = unknown>(token: string) => T;

/** Constructs an instance for a token whose wiring is not plain `new X(cradle)`. */
export type ManualProvider = (resolve: ResolveFn) => unknown;

/**
 * Tokens whose construction is non-standard (global access, provider/adapter
 * maps, `initialize()` calls, derived named loggers, or config/positional
 * constructor args) and therefore cannot be expressed as a plain `new X(cradle)`.
 * Standard-construction services are registered in `service-registrations.ts`.
 */
export const manualProviders: Record<string, ManualProvider> = {
  storageService: () =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS }),

  deviceStatusPort: (resolve) =>
    new TrpcDeviceStatusPort(
      trpcClient,
      resolve<LoggerFactoryLike>('loggerFactory').create('TrpcDeviceStatusPort')
    ),

  mediaDevicesPort: (resolve) =>
    new BrowserMediaDevicesPort(
      resolve('browserMediaService'),
      resolve<LoggerFactoryLike>('loggerFactory').create('BrowserMediaDevicesPort')
    ),

  devicePreferenceStore: (resolve) =>
    new StorageDevicePreferenceStore(
      resolve('storageService'),
      resolve<LoggerFactoryLike>('loggerFactory').create('StorageDevicePreferenceStore')
    ),

  canvasRenderLoopService: (resolve) =>
    new StreamingCanvasRenderLoopService(
      resolve<LoggerFactoryLike>('loggerFactory').create('StreamingCanvasRenderLoopService'),
      resolve('animationCache')
    ),

  streamingRendererFactory: (resolve) => {
    const rendererProviders = {
      gpu: (deps: unknown) => new StreamingGpuRendererAdapter(deps as never),
      canvas2d: (deps: unknown) => new StreamingCanvas2DRendererAdapter(deps as never)
    };
    const rendererFactory = new StreamingRendererFactory(
      resolve('eventBus'),
      resolve('loggerFactory'),
      rendererProviders as never
    );
    rendererFactory.initialize();
    return rendererFactory;
  },

  uiComponentRegistry: (resolve) =>
    new UIComponentRegistry({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory: resolve('loggerFactory')
    })
};
