import type { LoggerFactoryLike } from '@prismgb/core';
import { BrowserStorageAdapter } from '../../infrastructure/browser/browser-storage.adapter';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';
import { DeviceIpcAdapter } from '../../infrastructure/adapters/device-ipc.adapter';
import { DeviceChangeDebounceAdapter } from '../../infrastructure/adapters/device-change-debounce.adapter';
import { StreamingCanvasRenderLoopService } from '@renderer/infrastructure/services/streaming/canvas-render-loop.service';
import { StreamingRendererFactory } from '@renderer/infrastructure/services/streaming/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from '@renderer/infrastructure/services/streaming/adapters/streaming-gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from '@renderer/infrastructure/services/streaming/adapters/streaming-canvas2d-renderer.adapter';
import { DeviceIpcStatusAdapter } from '../../infrastructure/adapters/device-ipc-status.adapter';
import { StreamingAdapterFactory } from '@renderer/infrastructure/services/streaming/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '../../infrastructure/adapters/device-chromatic.adapter';
import { chromaticConfig } from '@prismgb/devices';
import { UIComponentRegistry } from '../../presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from '../../presentation/controller/ui-component.catalog';

/** Resolver handed to each provider so it can pull already-registered tokens. */
export type ResolveFn = <T = unknown>(token: string) => T;

/** Constructs an instance for a token whose wiring is not plain `new X(cradle)`. */
export type ManualProvider = (resolve: ResolveFn) => unknown;

/**
 * Tokens whose construction is non-standard (global access, provider/adapter
 * maps, `initialize()` calls, derived named loggers, or config/positional
 * constructor args) and therefore cannot be expressed as a scanned `@Service`
 * class. Standard-construction classes use `@Service` instead.
 */
export const manualProviders: Record<string, ManualProvider> = {
  storageService: () =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS }),

  deviceIpcAdapter: (resolve) =>
    new DeviceIpcAdapter({
      eventBus: resolve('eventBus'),
      logger: resolve<LoggerFactoryLike>('loggerFactory').create('DeviceIpcAdapter')
    }),

  deviceChangeDebounceAdapter: (resolve) =>
    new DeviceChangeDebounceAdapter({
      browserMediaService: resolve('browserMediaService'),
      logger: resolve<LoggerFactoryLike>('loggerFactory').create('DeviceChangeDebounceAdapter')
    }),

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

  ipcClient: () => {
    const globalWindow = window as unknown as { deviceAPI?: unknown };
    if (!globalWindow.deviceAPI) {
      throw new Error(
        'deviceAPI is not available in the renderer. The preload script may have failed to load.'
      );
    }
    return globalWindow.deviceAPI;
  },

  deviceStatusProvider: (resolve) =>
    new DeviceIpcStatusAdapter(resolve('ipcClient')),

  adapterFactory: (resolve) => {
    const adapterClasses = new Map([[chromaticConfig.id, DeviceChromaticAdapter]]);
    const adapterFactory = new StreamingAdapterFactory(
      resolve('eventBus'),
      resolve('loggerFactory'),
      resolve('browserMediaService'),
      adapterClasses as never
    );
    adapterFactory.initialize();
    return adapterFactory;
  },

  uiComponentRegistry: (resolve) =>
    new UIComponentRegistry({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory: resolve('loggerFactory')
    })
};
