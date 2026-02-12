import { PROTECTED_STORAGE_KEYS } from '@renderer/infrastructure/config/storage-keys.config';
import { EventBus } from '@renderer/infrastructure/events/event-bus.class.js';
import { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import { BrowserStorageAdapter } from '@renderer/infrastructure/browser/browser-storage.adapter.js';
import { BrowserMediaAdapter } from '@renderer/infrastructure/browser/browser-media.adapter.js';
import { VisibilityAdapter } from '@renderer/infrastructure/adapters/visibility.adapter.js';
import { UserActivityAdapter } from '@renderer/infrastructure/adapters/user-activity.adapter.js';
import { ReducedMotionAdapter } from '@renderer/infrastructure/adapters/reduced-motion.adapter.js';
import { MetricsAdapter } from '@renderer/infrastructure/adapters/platform/metrics.adapter';
import { DeviceIpcAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc.adapter';
import { DeviceChangeDebounceAdapter } from '@renderer/infrastructure/adapters/devices/device-change-debounce.adapter';
import { DeviceIpcStatusAdapter } from '@renderer/infrastructure/adapters/devices/device-ipc-status.adapter';
import { StreamingCanvasRenderer } from '@renderer/infrastructure/services/streaming/canvas-renderer';
import { StreamingViewportService } from '@renderer/infrastructure/services/streaming/viewport.service';
import { StreamingCanvasLifecycleService } from '@renderer/infrastructure/services/streaming/canvas-lifecycle.service';
import { StreamingGpuRenderLoopService } from '@renderer/infrastructure/services/streaming/gpu-render-loop.service';
import { StreamingHealthService } from '@renderer/infrastructure/services/streaming/health.service';
import { StreamingGpuRendererService } from '@renderer/infrastructure/services/streaming/gpu-renderer.service';
import { StreamingRendererFactory } from '@renderer/infrastructure/factories/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from '@renderer/infrastructure/adapters/streaming/gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from '@renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter';
import { StreamingRenderPipelineService } from '@renderer/infrastructure/services/streaming/render-pipeline.service';
import { GpuFrameBuffer } from '@renderer/infrastructure/services/streaming/gpu-frame-buffer';
import { GpuWorkerManager } from '@renderer/infrastructure/services/streaming/gpu-worker-manager';
import { AnimationCache } from '@renderer/infrastructure/utils/performance-cache.utils';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerInfrastructure(container: RegistrableContainer<RendererContainerMap>): void {
  container.autoRegister('eventBus', EventBus);

  container.registerFactory('loggerFactory', function() {
    return new RendererLogger();
  }, []);

  container.registerFactory('storageService', function() {
    return new BrowserStorageAdapter({
      protectedKeys: PROTECTED_STORAGE_KEYS
    });
  }, []);

  container.registerFactory('browserMediaService', function() {
    return new BrowserMediaAdapter();
  }, []);

  container.registerFactory('visibilityAdapter', function() {
    return new VisibilityAdapter();
  }, []);

  container.registerFactory('userActivityAdapter', function() {
    return new UserActivityAdapter();
  }, []);

  container.registerFactory('reducedMotionAdapter', function() {
    return new ReducedMotionAdapter();
  }, []);

  container.registerFactory('metricsAdapter', function() {
    return new MetricsAdapter();
  }, []);

  container.autoRegister('deviceIpcAdapter', DeviceIpcAdapter);
  container.autoRegister('deviceChangeDebounceAdapter', DeviceChangeDebounceAdapter);

  container.registerFactory('animationCache', function() {
    return new AnimationCache();
  }, []);

  container.registerFactory(
    'canvasRenderer',
    function(loggerFactory: RendererLogger, animationCache: AnimationCache) {
      return new StreamingCanvasRenderer(
        loggerFactory.create('StreamingCanvasRenderer'),
        animationCache
      );
    },
    ['loggerFactory', 'animationCache']
  );

  container.autoRegister('viewportService', StreamingViewportService);
  container.autoRegister('canvasLifecycleService', StreamingCanvasLifecycleService);
  container.autoRegister('gpuRenderLoopService', StreamingGpuRenderLoopService);
  container.autoRegister('streamHealthService', StreamingHealthService);
  container.autoRegister('gpuFrameBuffer', GpuFrameBuffer);
  container.autoRegister('gpuWorkerManager', GpuWorkerManager);
  container.autoRegister('gpuRendererService', StreamingGpuRendererService);

  container.registerFactory(
    'streamingRendererFactory',
    function(eventBus, loggerFactory) {
      const rendererClasses = new Map<string, unknown>([
        ['gpu', StreamingGpuRendererAdapter],
        ['canvas2d', StreamingCanvas2DRendererAdapter]
      ]);
      const rendererFactory = new StreamingRendererFactory(eventBus, loggerFactory, rendererClasses);
      rendererFactory.initialize();
      return rendererFactory;
    },
    ['eventBus', 'loggerFactory']
  );

  container.autoRegister('renderPipelineService', StreamingRenderPipelineService);

  container.registerFactory('ipcClient', function () {
    if (!window.deviceAPI) {
      throw new Error('deviceAPI is not available in the renderer. The preload script may have failed to load.');
    }
    return window.deviceAPI;
  }, []);

  container.autoRegister('deviceStatusProvider', DeviceIpcStatusAdapter);
}
