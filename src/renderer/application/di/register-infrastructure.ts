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
import { StreamingCanvasRenderLoopService } from '@renderer/infrastructure/services/streaming/canvas-render-loop.service';
import { StreamingViewportService } from '@renderer/infrastructure/services/streaming/viewport.service';
import { StreamingCanvasLifecycleService } from '@renderer/infrastructure/services/streaming/canvas-lifecycle.service';
import { StreamingGpuRenderLoopService } from '@renderer/infrastructure/services/streaming/gpu-render-loop.service';
import { StreamingHealthService } from '@renderer/infrastructure/services/streaming/health.service';
import { StreamingGpuRendererService } from '@renderer/infrastructure/services/streaming/gpu-renderer.service';
import {
  StreamingRendererFactory,
  type RendererProviderRegistry
} from '@renderer/infrastructure/factories/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from '@renderer/infrastructure/adapters/streaming/gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from '@renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter';
import { StreamingRenderPipelineService } from '@renderer/infrastructure/services/streaming/render-pipeline.service';
import { GpuFrameBuffer } from '@renderer/infrastructure/services/streaming/gpu-frame-buffer';
import { GpuWorkerManager } from '@renderer/infrastructure/services/streaming/gpu-worker-manager';
import { AnimationCache } from '@shared/utils/performance-cache.utils.js';
import {
  defineRendererDescriptors,
  registerRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.js';
import type { RegistrableContainer } from './registrable-container.type';
import type { RendererContainerMap } from './renderer-container-map.type';

type DeviceIpcDependencies = Pick<RendererContainerMap, 'loggerFactory'>;
type DeviceChangeDebounceDependencies = Pick<RendererContainerMap, 'browserMediaService' | 'loggerFactory'>;
type CanvasRenderLoopDependencies = Pick<RendererContainerMap, 'loggerFactory' | 'animationCache'>;
type StreamingRendererFactoryDependencies = Pick<RendererContainerMap, 'eventBus' | 'loggerFactory'>;
type DeviceStatusProviderDependencies = Pick<RendererContainerMap, 'ipcClient'>;

const rendererInfrastructureDescriptors = defineRendererDescriptors<RendererContainerMap>([
  {
    token: 'eventBus',
    kind: 'class',
    resolver: EventBus
  },
  {
    token: 'loggerFactory',
    kind: 'class',
    resolver: RendererLogger
  },
  {
    token: 'storageService',
    kind: 'function',
    dependencies: [],
    resolver: () => new BrowserStorageAdapter({
      protectedKeys: PROTECTED_STORAGE_KEYS
    })
  },
  {
    token: 'browserMediaService',
    kind: 'class',
    resolver: BrowserMediaAdapter,
    disposal: 'dispose'
  },
  {
    token: 'visibilityAdapter',
    kind: 'class',
    resolver: VisibilityAdapter,
    disposal: 'dispose'
  },
  {
    token: 'userActivityAdapter',
    kind: 'class',
    resolver: UserActivityAdapter,
    disposal: 'dispose'
  },
  {
    token: 'reducedMotionAdapter',
    kind: 'class',
    resolver: ReducedMotionAdapter,
    disposal: 'dispose'
  },
  {
    token: 'metricsAdapter',
    kind: 'class',
    resolver: MetricsAdapter
  },
  {
    token: 'deviceIpcAdapter',
    kind: 'function',
    dependencies: ['loggerFactory'],
    disposal: 'dispose',
    resolver: (dependencies: DeviceIpcDependencies) => new DeviceIpcAdapter({
      logger: dependencies.loggerFactory.create('DeviceIpcAdapter')
    })
  },
  {
    token: 'deviceChangeDebounceAdapter',
    kind: 'function',
    dependencies: ['browserMediaService', 'loggerFactory'],
    disposal: 'dispose',
    resolver: (dependencies: DeviceChangeDebounceDependencies) => new DeviceChangeDebounceAdapter({
      browserMediaService: dependencies.browserMediaService,
      logger: dependencies.loggerFactory.create('DeviceChangeDebounceAdapter')
    })
  },
  {
    token: 'animationCache',
    kind: 'class',
    resolver: AnimationCache,
    disposal: 'dispose'
  },
  {
    token: 'canvasRenderLoopService',
    kind: 'function',
    dependencies: ['loggerFactory', 'animationCache'],
    disposal: 'dispose',
    resolver: (dependencies: CanvasRenderLoopDependencies) => {
      return new StreamingCanvasRenderLoopService(
        dependencies.loggerFactory.create('StreamingCanvasRenderLoopService'),
        dependencies.animationCache
      );
    }
  },
  {
    token: 'viewportService',
    kind: 'class',
    resolver: StreamingViewportService,
    disposal: 'dispose'
  },
  {
    token: 'canvasLifecycleService',
    kind: 'class',
    resolver: StreamingCanvasLifecycleService,
    disposal: 'dispose'
  },
  {
    token: 'gpuRenderLoopService',
    kind: 'class',
    resolver: StreamingGpuRenderLoopService,
    disposal: 'dispose'
  },
  {
    token: 'streamHealthService',
    kind: 'class',
    resolver: StreamingHealthService,
    disposal: 'dispose'
  },
  {
    token: 'gpuFrameBuffer',
    kind: 'function',
    dependencies: ['loggerFactory'],
    resolver: ({ loggerFactory }) => new GpuFrameBuffer({ loggerFactory })
  },
  {
    token: 'gpuWorkerManager',
    kind: 'class',
    resolver: GpuWorkerManager,
    disposal: 'dispose'
  },
  {
    token: 'gpuRendererService',
    kind: 'class',
    resolver: StreamingGpuRendererService,
    disposal: 'dispose'
  },
  {
    token: 'streamingRendererFactory',
    kind: 'function',
    dependencies: ['eventBus', 'loggerFactory'],
    resolver: ({ eventBus, loggerFactory }: StreamingRendererFactoryDependencies) => {
      const rendererProviders: RendererProviderRegistry = {
        gpu: (dependencies) => new StreamingGpuRendererAdapter(dependencies),
        canvas2d: (dependencies) => new StreamingCanvas2DRendererAdapter(dependencies)
      };
      const rendererFactory = new StreamingRendererFactory(eventBus, loggerFactory, rendererProviders);
      rendererFactory.initialize();
      return rendererFactory;
    }
  },
  {
    token: 'renderPipelineService',
    kind: 'class',
    resolver: StreamingRenderPipelineService,
    disposal: 'dispose'
  },
  {
    token: 'ipcClient',
    kind: 'function',
    dependencies: [],
    resolver: () => {
      const globalWindow = window as Window & { deviceAPI?: unknown };
      if (!globalWindow.deviceAPI) {
        throw new Error('deviceAPI is not available in the renderer. The preload script may have failed to load.');
      }
      return globalWindow.deviceAPI;
    }
  },
  {
    token: 'deviceStatusProvider',
    kind: 'function',
    dependencies: ['ipcClient'],
    resolver: (dependencies: DeviceStatusProviderDependencies) => new DeviceIpcStatusAdapter(dependencies.ipcClient)
  }
]);

export function registerInfrastructure(container: RegistrableContainer<RendererContainerMap>): void {
  registerRendererDescriptors(container, rendererInfrastructureDescriptors);
}
