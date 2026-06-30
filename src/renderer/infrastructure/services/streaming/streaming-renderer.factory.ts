import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';
import type { IStreamingRenderer } from '@renderer/infrastructure/services/streaming/adapters/streaming-renderer.interface';
import type { Canvas2DRendererAdapterDependencies } from '@renderer/infrastructure/services/streaming/adapters/streaming-canvas2d-renderer.adapter';
import type { GpuRendererAdapterDependencies } from '@renderer/infrastructure/services/streaming/adapters/streaming-gpu-renderer.adapter';

export type RendererType = 'gpu' | 'canvas2d';

export type RendererDependencyMap = {
  gpu: GpuRendererAdapterDependencies;
  canvas2d: Canvas2DRendererAdapterDependencies;
};

export type RendererCreateDependencies<TType extends RendererType> = Omit<RendererDependencyMap[TType], 'loggerFactory'>;

export type RendererProvider<TType extends RendererType> = (
  dependencies: RendererDependencyMap[TType]
) => IStreamingRenderer;

export type RendererProviderRegistry = {
  [TType in RendererType]: RendererProvider<TType>;
};

export type RendererCreateRequest =
  | {
      type: 'gpu';
      dependencies: RendererCreateDependencies<'gpu'>;
    }
  | {
      type: 'canvas2d';
      dependencies: RendererCreateDependencies<'canvas2d'>;
    };

export class StreamingRendererFactory {
  private readonly eventBus: EventBusLike;
  private readonly loggerFactory: LoggerFactoryLike;
  private readonly logger: LoggerLike;
  private readonly _rendererProviders: RendererProviderRegistry;
  private readonly _commonDependencies: Pick<GpuRendererAdapterDependencies, 'loggerFactory'>;
  private _initialized: boolean;

  constructor(
    eventBus: EventBusLike,
    loggerFactory: LoggerFactoryLike,
    rendererProviders: RendererProviderRegistry
  ) {
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.logger = loggerFactory.create('StreamingRendererFactory');

    this._rendererProviders = rendererProviders;

    this._commonDependencies = {
      loggerFactory: this.loggerFactory
    };

    this._initialized = false;
  }

  initialize(): void {
    if (this._initialized) {
      this.logger.warn('StreamingRendererFactory already initialized');
      return;
    }

    this._initialized = true;
    this.logger.info('StreamingRendererFactory initialized');
  }

  createRenderer(request: RendererCreateRequest): IStreamingRenderer {
    if (!this._initialized) {
      throw new Error('StreamingRendererFactory not initialized. Call initialize() first.');
    }

    const { type } = request;

    if (type !== 'gpu' && type !== 'canvas2d') {
      throw new Error(`No renderer registered for type: ${type}`);
    }

    this.logger.debug(`Creating ${type} renderer`);

    if (request.type === 'gpu') {
      return this._rendererProviders.gpu({
        ...this._commonDependencies,
        ...request.dependencies
      });
    }

    return this._rendererProviders.canvas2d({
      ...this._commonDependencies,
      ...request.dependencies
    });
  }

  selectRendererType(
    capabilities: { supportsGPU?: boolean } | null | undefined,
    performanceModeEnabled: boolean,
    gpuAvailable: boolean
  ): RendererType {
    if (performanceModeEnabled) {
      this.logger.debug('Performance mode active - selecting Canvas2D');
      return 'canvas2d';
    }

    if (gpuAvailable && capabilities?.supportsGPU !== false) {
      this.logger.debug('GPU available - selecting GPU');
      return 'gpu';
    }

    this.logger.debug('GPU not available - selecting Canvas2D');
    return 'canvas2d';
  }
}
