import { PROTECTED_STORAGE_KEYS } from '@shared/config/storage-keys.config';
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
import { AnimationCache } from '@shared/utils/performance-cache.utils.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

export function registerInfrastructure(container: RegistrableContainer<RendererContainerMap>): void {
  container.registerSingleton(
    'eventBus',
    function (loggerFactory) {
      return new EventBus({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton('loggerFactory', function() {
    return new RendererLogger();
  }, []);

  container.registerSingleton('storageService', function() {
    return new BrowserStorageAdapter({
      protectedKeys: PROTECTED_STORAGE_KEYS
    });
  }, []);

  container.registerSingleton('browserMediaService', function() {
    return new BrowserMediaAdapter();
  }, []);

  container.registerSingleton('visibilityAdapter', function() {
    return new VisibilityAdapter();
  }, []);

  container.registerSingleton('userActivityAdapter', function() {
    return new UserActivityAdapter();
  }, []);

  container.registerSingleton('reducedMotionAdapter', function() {
    return new ReducedMotionAdapter();
  }, []);

  container.registerSingleton('metricsAdapter', function() {
    return new MetricsAdapter();
  }, []);

  container.registerSingleton('deviceIpcAdapter', function(loggerFactory: RendererLogger) {
    return new DeviceIpcAdapter({ logger: loggerFactory.create('DeviceIpcAdapter') });
  }, ['loggerFactory']);

  container.registerSingleton(
    'deviceChangeDebounceAdapter',
    function(browserMediaService: BrowserMediaAdapter, loggerFactory: RendererLogger) {
      return new DeviceChangeDebounceAdapter({
        browserMediaService,
        logger: loggerFactory.create('DeviceChangeDebounceAdapter')
      });
    },
    ['browserMediaService', 'loggerFactory']
  );

  container.registerSingleton('animationCache', function() {
    return new AnimationCache();
  }, []);

  container.registerSingleton(
    'canvasRenderer',
    function(loggerFactory: RendererLogger, animationCache: AnimationCache) {
      return new StreamingCanvasRenderer(
        loggerFactory.create('StreamingCanvasRenderer'),
        animationCache
      );
    },
    ['loggerFactory', 'animationCache']
  );

  container.registerSingleton(
    'viewportService',
    function(loggerFactory) {
      return new StreamingViewportService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'canvasLifecycleService',
    function(streamViewService, canvasRenderer, viewportService, gpuRendererService, eventBus, loggerFactory) {
      return new StreamingCanvasLifecycleService({
        streamViewService,
        canvasRenderer,
        viewportService,
        gpuRendererService,
        eventBus,
        loggerFactory
      });
    },
    ['streamViewService', 'canvasRenderer', 'viewportService', 'gpuRendererService', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton(
    'gpuRenderLoopService',
    function(loggerFactory) {
      return new StreamingGpuRenderLoopService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'streamHealthService',
    function(loggerFactory) {
      return new StreamingHealthService({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'gpuFrameBuffer',
    function(loggerFactory) {
      return new GpuFrameBuffer({ loggerFactory });
    },
    ['loggerFactory']
  );

  container.registerSingleton(
    'gpuWorkerManager',
    function(loggerFactory, eventBus) {
      return new GpuWorkerManager({ loggerFactory, eventBus });
    },
    ['loggerFactory', 'eventBus']
  );

  container.registerSingleton(
    'gpuRendererService',
    function(eventBus, loggerFactory, settingsService, gpuFrameBuffer, gpuWorkerManager) {
      return new StreamingGpuRendererService({
        eventBus,
        loggerFactory,
        settingsService,
        gpuFrameBuffer,
        gpuWorkerManager
      });
    },
    ['eventBus', 'loggerFactory', 'settingsService', 'gpuFrameBuffer', 'gpuWorkerManager']
  );

  container.registerSingleton(
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

  container.registerSingleton(
    'renderPipelineService',
    function(appState, streamViewService, canvasRenderer, canvasLifecycleService, streamHealthService, streamingRendererFactory, gpuRendererService, gpuRenderLoopService, eventBus, loggerFactory) {
      return new StreamingRenderPipelineService({
        appState,
        streamViewService,
        canvasRenderer,
        canvasLifecycleService,
        streamHealthService,
        streamingRendererFactory,
        gpuRendererService,
        gpuRenderLoopService,
        eventBus,
        loggerFactory
      });
    },
    ['appState', 'streamViewService', 'canvasRenderer', 'canvasLifecycleService', 'streamHealthService', 'streamingRendererFactory', 'gpuRendererService', 'gpuRenderLoopService', 'eventBus', 'loggerFactory']
  );

  container.registerSingleton('ipcClient', function () {
    if (!window.deviceAPI) {
      throw new Error('deviceAPI is not available in the renderer. The preload script may have failed to load.');
    }
    return window.deviceAPI;
  }, []);

  container.registerSingleton(
    'deviceStatusProvider',
    function (ipcClient) {
      return new DeviceIpcStatusAdapter(ipcClient);
    },
    ['ipcClient']
  );
}
