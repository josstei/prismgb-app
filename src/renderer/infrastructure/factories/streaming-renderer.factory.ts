/**
 * Streaming Renderer Factory
 *
 * Factory for creating GPU and Canvas2D renderer adapters.
 * Handles renderer type selection based on capabilities and performance mode.
 *
 * Follows the StreamingAdapterFactory pattern:
 * - Registry-based adapter management
 * - DI-injected renderer classes
 * - Common dependencies reused across adapters
 */

import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@shared/interfaces/infrastructure.types.js';
import { TypedRegistryFactory } from '@shared/registry/typed-registry.factory';

export type RendererConstructor = new (deps: Record<string, unknown>) => unknown;

export class StreamingRendererFactory {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  logger: LoggerLike;
  _rendererClasses: Map<string, RendererConstructor>;
  _commonDependencies: Record<string, unknown>;
  _rendererRegistry: TypedRegistryFactory<RendererConstructor, Record<string, unknown>>;
  _initialized: boolean;

  /**
   * @param {Object} eventBus - Event bus for cross-service communication
   * @param {Object} loggerFactory - Factory for creating loggers
   * @param {Map<string, class>} rendererClasses - Map of renderer type IDs to adapter classes (injected via DI)
   */
  constructor(
    eventBus: EventBusLike,
    loggerFactory: LoggerFactoryLike,
    rendererClasses: Map<string, RendererConstructor> = new Map()
  ) {
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.logger = loggerFactory.create('StreamingRendererFactory');

    // Renderer classes registered via DI bootstrap
    this._rendererClasses = rendererClasses;

    // Common dependencies for all renderers
    this._commonDependencies = {
      loggerFactory: this.loggerFactory
    };

    this._rendererRegistry = new TypedRegistryFactory();

    // Track initialization
    this._initialized = false;
  }

  /**
   * Initialize renderer registry
   * Registers renderers from classes injected via DI
   */
  initialize() {
    if (this._initialized) {
      this.logger.warn('StreamingRendererFactory already initialized');
      return;
    }

    try {
      for (const [typeId, RendererClass] of this._rendererClasses) {
        this._register(typeId, RendererClass);
      }

      this._initialized = true;
      this.logger.info(`Loaded ${this._rendererRegistry.listIds().length} renderer(s)`);
    } catch (error) {
      this.logger.error('Failed to initialize renderer registry', error);
      throw error;
    }
  }

  /**
   * Register a renderer class with metadata
   * @param {string} typeId - Renderer type identifier ('gpu' or 'canvas2d')
   * @param {class} RendererClass - Renderer adapter class constructor
   * @param {Object} metadata - Renderer metadata
   * @private
   */
  _register(typeId: string, RendererClass: RendererConstructor, metadata: Record<string, unknown> = {}) {
    const normalizedMetadata = {
      typeId,
      supportsPresets: typeId === 'gpu',
      ...metadata
    };

    this._rendererRegistry.registerValue(typeId, RendererClass, normalizedMetadata);
  }

  /**
   * Create a renderer adapter instance
   * @param {string} typeId - Renderer type ('gpu' or 'canvas2d')
   * @param {Object} dependencies - Additional dependencies for the renderer
   * @returns {IStreamingRenderer} Renderer adapter instance
   */
  createRenderer(typeId: string, dependencies: Record<string, unknown> = {}) {
    if (!this._initialized) {
      throw new Error('StreamingRendererFactory not initialized. Call initialize() first.');
    }

    let RendererClass;
    try {
      RendererClass = this._rendererRegistry.create(typeId);
    } catch {
      throw new Error(`No renderer registered for type: ${typeId}`);
    }

    if (!RendererClass) {
      throw new Error(`No renderer registered for type: ${typeId}`);
    }

    this.logger.debug(`Creating ${typeId} renderer`);

    const resolvedDeps = {
      ...this._commonDependencies,
      ...dependencies
    };

    return new RendererClass(resolvedDeps);
  }

  /**
   * Select renderer type based on capabilities and performance mode
   * @param {Object} capabilities - Device capabilities
   * @param {boolean} performanceModeEnabled - Whether performance mode is active
   * @param {boolean} gpuAvailable - Whether GPU rendering is available
   * @returns {string} Renderer type ('gpu' or 'canvas2d')
   */
  selectRendererType(
    capabilities: { supportsGPU?: boolean } | null | undefined,
    performanceModeEnabled: boolean,
    gpuAvailable: boolean
  ) {
    // Performance mode forces Canvas2D
    if (performanceModeEnabled) {
      this.logger.debug('Performance mode active - selecting Canvas2D');
      return 'canvas2d';
    }

    // Use GPU if available
    if (gpuAvailable && capabilities?.supportsGPU !== false) {
      this.logger.debug('GPU available - selecting GPU');
      return 'gpu';
    }

    // Fallback to Canvas2D
    this.logger.debug('GPU not available - selecting Canvas2D');
    return 'canvas2d';
  }

  /**
   * Check if renderer type is registered
   * @param {string} typeId - Renderer type to check
   * @returns {boolean} True if registered
   */
  hasRenderer(typeId: string) {
    return this._rendererRegistry.has(typeId);
  }

  /**
   * Get all registered renderer types
   * @returns {string[]} Array of registered type IDs
   */
  getRegisteredTypes() {
    return this._rendererRegistry.listIds();
  }

  /**
   * Get renderer metadata
   * @param {string} typeId - Renderer type
   * @returns {Object|undefined} Renderer metadata
   */
  getMetadata(typeId: string) {
    return this._rendererRegistry.getMetadata(typeId);
  }

  /**
   * Register a custom renderer type
   * @param {string} typeId - Renderer type identifier
   * @param {class} RendererClass - Renderer adapter class constructor
   * @param {Object} metadata - Renderer metadata
   */
  registerRenderer(typeId: string, RendererClass: RendererConstructor, metadata: Record<string, unknown> = {}) {
    this._register(typeId, RendererClass, metadata);
    this.logger.info(`Registered renderer: ${typeId}`);
  }

  /**
   * Unregister a renderer type
   * @param {string} typeId - Renderer type to remove
   */
  unregister(typeId: string) {
    this._rendererRegistry.unregister(typeId);
  }

  /**
   * Clear all registrations
   */
  clear() {
    this._rendererRegistry.clear();
    this._initialized = false;
  }
}
