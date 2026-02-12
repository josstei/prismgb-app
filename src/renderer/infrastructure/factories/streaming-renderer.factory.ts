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

import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';

type RendererConstructor = new (deps: Record<string, unknown>) => unknown;

export class StreamingRendererFactory {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  logger: LoggerLike;
  _rendererClasses: Map<string, RendererConstructor>;
  _commonDependencies: Record<string, unknown>;
  rendererRegistry: Map<string, RendererConstructor>;
  metadataRegistry: Map<string, Record<string, unknown>>;
  _initialized: boolean;

  /**
   * @param {Object} eventBus - Event bus for cross-service communication
   * @param {Object} loggerFactory - Factory for creating loggers
   * @param {Map<string, class>} rendererClasses - Map of renderer type IDs to adapter classes (injected via DI)
   */
  constructor(eventBus, loggerFactory, rendererClasses = new Map()) {
    this.eventBus = eventBus;
    this.loggerFactory = loggerFactory;
    this.logger = loggerFactory.create('StreamingRendererFactory');

    // Renderer classes registered via DI bootstrap
    this._rendererClasses = rendererClasses;

    // Common dependencies for all renderers
    this._commonDependencies = {
      loggerFactory: this.loggerFactory
    };

    // Renderer and metadata registries
    this.rendererRegistry = new Map();
    this.metadataRegistry = new Map();

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
      this.logger.info(`Loaded ${this.rendererRegistry.size} renderer(s)`);
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
  _register(typeId, RendererClass, metadata = {}) {
    this.rendererRegistry.set(typeId, RendererClass);
    this.metadataRegistry.set(typeId, {
      typeId,
      supportsPresets: typeId === 'gpu',
      ...metadata
    });
  }

  /**
   * Create a renderer adapter instance
   * @param {string} typeId - Renderer type ('gpu' or 'canvas2d')
   * @param {Object} dependencies - Additional dependencies for the renderer
   * @returns {IStreamingRenderer} Renderer adapter instance
   */
  createRenderer(typeId, dependencies = {}) {
    if (!this._initialized) {
      throw new Error('StreamingRendererFactory not initialized. Call initialize() first.');
    }

    const RendererClass = this.rendererRegistry.get(typeId);
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
  selectRendererType(capabilities, performanceModeEnabled, gpuAvailable) {
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
  hasRenderer(typeId) {
    return this.rendererRegistry.has(typeId);
  }

  /**
   * Get all registered renderer types
   * @returns {string[]} Array of registered type IDs
   */
  getRegisteredTypes() {
    return Array.from(this.rendererRegistry.keys());
  }

  /**
   * Get renderer metadata
   * @param {string} typeId - Renderer type
   * @returns {Object|undefined} Renderer metadata
   */
  getMetadata(typeId) {
    return this.metadataRegistry.get(typeId);
  }

  /**
   * Register a custom renderer type
   * @param {string} typeId - Renderer type identifier
   * @param {class} RendererClass - Renderer adapter class constructor
   * @param {Object} metadata - Renderer metadata
   */
  registerRenderer(typeId, RendererClass, metadata = {}) {
    this._register(typeId, RendererClass, metadata);
    this.logger.info(`Registered renderer: ${typeId}`);
  }

  /**
   * Unregister a renderer type
   * @param {string} typeId - Renderer type to remove
   */
  unregister(typeId) {
    this.rendererRegistry.delete(typeId);
    this.metadataRegistry.delete(typeId);
  }

  /**
   * Clear all registrations
   */
  clear() {
    this.rendererRegistry.clear();
    this.metadataRegistry.clear();
    this._initialized = false;
  }
}
