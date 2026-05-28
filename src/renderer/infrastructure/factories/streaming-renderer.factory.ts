import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';
import { TypedRegistryFactory } from '@shared/registry/typed-registry.factory';
import type { IStreamingRenderer } from '@renderer/infrastructure/adapters/streaming/streaming-renderer.interface';
import type { Canvas2DRendererAdapterDependencies } from '@renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter';
import type { GpuRendererAdapterDependencies } from '@renderer/infrastructure/adapters/streaming/gpu-renderer.adapter';

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

type RendererMetadata = {
  typeId: RendererType;
  supportsPresets: boolean;
};

export class StreamingRendererFactory {
  private readonly eventBus: EventBusLike;
  private readonly loggerFactory: LoggerFactoryLike;
  private readonly logger: LoggerLike;
  private readonly _rendererProviders: RendererProviderRegistry;
  private readonly _commonDependencies: Pick<GpuRendererAdapterDependencies, 'loggerFactory'>;
  private readonly _rendererRegistry: TypedRegistryFactory<RendererType, RendererMetadata>;
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

    this._rendererRegistry = new TypedRegistryFactory();

    this._initialized = false;
  }

  initialize(): void {
    if (this._initialized) {
      this.logger.warn('StreamingRendererFactory already initialized');
      return;
    }

    try {
      this._register('gpu');
      this._register('canvas2d');

      this._initialized = true;
      this.logger.info(`Loaded ${this._rendererRegistry.listIds().length} renderer(s)`);
    } catch (error) {
      this.logger.error('Failed to initialize renderer registry', error);
      throw error;
    }
  }

  _register(typeId: RendererType, metadata: Partial<RendererMetadata> = {}): void {
    if (!this._rendererProviders[typeId]) {
      throw new Error(`No renderer provider configured for type: ${typeId}`);
    }

    const normalizedMetadata = {
      typeId,
      supportsPresets: typeId === 'gpu',
      ...metadata
    };

    this._rendererRegistry.registerValue(typeId, typeId, normalizedMetadata);
  }

  createRenderer(request: RendererCreateRequest): IStreamingRenderer {
    if (!this._initialized) {
      throw new Error('StreamingRendererFactory not initialized. Call initialize() first.');
    }
    const { type } = request;

    try {
      this._rendererRegistry.create(type);
    } catch {
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

  hasRenderer(typeId: RendererType): boolean {
    return this._rendererRegistry.has(typeId);
  }

  getRegisteredTypes(): string[] {
    return this._rendererRegistry.listIds();
  }

  getMetadata(typeId: RendererType): RendererMetadata | undefined {
    return this._rendererRegistry.getMetadata(typeId);
  }

  registerRenderer(
    typeId: RendererType,
    rendererProvider: RendererProvider<'gpu'> | RendererProvider<'canvas2d'>,
    metadata: Partial<RendererMetadata> = {}
  ): void {
    if (typeId === 'gpu') {
      this._rendererProviders.gpu = rendererProvider as RendererProvider<'gpu'>;
    } else {
      this._rendererProviders.canvas2d = rendererProvider as RendererProvider<'canvas2d'>;
    }
    this._register(typeId, metadata);
    this.logger.info(`Registered renderer: ${typeId}`);
  }

  unregister(typeId: RendererType): boolean {
    this._rendererRegistry.unregister(typeId);
    return true;
  }

  clear(): void {
    this._rendererRegistry.clear();
    this._initialized = false;
  }
}
