/**
 * Renderer Application Orchestrator
 *
 * Coordinates renderer bootstrap and orchestrator lifecycle:
 * - Creates and configures the DI container
 * - Initializes UI components
 * - Resolves and starts the orchestrator
 * - Manages application lifecycle
 */

import { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import { UIController } from '@renderer/ui/controller/ui.controller.js';
import { safeDispose, safeDisposeAll } from '@shared/utils/safe-disposer.utils.js';

/**
 * Retry a dynamic import with exponential backoff
 * @param {() => Promise<T>} importFn - Function that returns the import promise
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelayMs - Base delay between retries (doubles each attempt)
 * @returns {Promise<T>}
 */
async function importWithRetry(importFn, maxRetries = 3, baseDelayMs = 300) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await importFn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.debug(`[importWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

class RendererAppOrchestrator {
  constructor() {
    this.container = null;
    this.orchestrator = null;
    this.isInitialized = false;

    // Create logger for bootstrap logging
    const loggerFactory = new RendererLogger();
    this.logger = loggerFactory.create('RendererAppOrchestrator');
  }

  /**
   * Initialize the renderer application
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Renderer application already initialized');
      return;
    }

    this.logger.info('Initializing renderer application...');

    try {
      // 1. Create DI container with retry for resilience
      const { initializeContainer } = await importWithRetry(
        () => import('./container.js')
      );
      this.container = initializeContainer();

      // 2. Initialize UI components (not managed by DI)
      await this._initializeUI();

      // 3. Register UI components in container
      await this._registerUIComponents();

      // 4. Initialize adapter factory (async initialization)
      await this._initializeAdapterFactory();

      // 5. Initialize UI event bridge (bridges events to UIController)
      await this._initializeUIEventBridge();

      // 6. Resolve orchestrator (this will wire everything up)
      this.orchestrator = this.container.resolve('appOrchestrator');

      // 7. Initialize orchestrator
      await this.orchestrator.initialize();

      this.isInitialized = true;
      this.logger.info('Renderer application initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize renderer application:', error);
      throw error;
    }
  }

  /**
   * Start the renderer application
   * @returns {Promise<void>}
   */
  async start() {
    if (!this.isInitialized) {
      throw new Error('Renderer application not initialized. Call initialize() first.');
    }

    try {
      // Start the orchestrator
      await this.orchestrator.start();

      this.logger.info('Renderer application started successfully');

    } catch (error) {
      this.logger.error('Failed to start renderer application:', error);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown
   */
  async cleanup() {
    this.logger.info('Cleaning up renderer application...');

    // Cleanup orchestrator first
    await safeDispose(this.logger, 'orchestrator', this.orchestrator, 'cleanup');

    // Cleanup UI bridges and controllers
    await safeDisposeAll(this.logger, [
      ['CaptureUIBridge', this._captureUiBridge],
      ['UIController', this._uiController]
    ]);

    // Cleanup AppState (resolved from container)
    const appState = this.container?.resolve?.('appState');
    await safeDispose(this.logger, 'AppState', appState);

    // Cleanup container last
    await safeDispose(this.logger, 'container', this.container);

    this.isInitialized = false;
    this.logger.info('Renderer application cleanup complete');
  }

  /**
   * Initialize UI components (not managed by DI)
   * @private
   */
  async _initializeUI() {
    // Get dependencies from DI
    const uiComponentRegistry = this.container.resolve('uiComponentRegistry');
    const uiEffects = this.container.resolve('uiEffects');
    const loggerFactory = this.container.resolve('loggerFactory');

    // Create UIController with new dependencies
    const uiController = new UIController({
      uiComponentRegistry,
      uiEffects,
      loggerFactory
    });

    // Wire up elements to UIEffects after UIController creates them
    uiEffects.elements = uiController.elements;

    // Initialize component registry with elements
    uiController.initializeComponents();

    // Store references for registration
    this._uiController = uiController;
  }

  /**
   * Register UI components in DI container
   * @private
   */
  async _registerUIComponents() {
    const { asValue } = await importWithRetry(() => import('./container.js'));

    // Register UI components as values (already instantiated)
    this.container.register({
      uiController: asValue(this._uiController)
    });
  }

  /**
   * Initialize adapter factory
   * @private
   */
  async _initializeAdapterFactory() {
    try {
      const adapterFactory = this.container.resolve('adapterFactory');
      await adapterFactory.initialize();
    } catch (error) {
      this.logger.error('Failed to initialize adapter factory:', error);
      throw error;
    }
  }

  /**
   * Initialize UI event bridge
   * @private
   */
  async _initializeUIEventBridge() {
    try {
      const uiEventBridge = this.container.resolve('uiEventBridge');
      uiEventBridge.initialize();
      this._uiEventBridge = uiEventBridge;

      const captureUiBridge = this.container.resolve('captureUiBridge');
      captureUiBridge.initialize();
      this._captureUiBridge = captureUiBridge;
    } catch (error) {
      this.logger.error('Failed to initialize UI event bridge:', error);
      throw error;
    }
  }
}

/**
 * Create and initialize application
 * @returns {Promise<RendererAppOrchestrator>}
 */
async function createApplication() {
  const app = new RendererAppOrchestrator();
  await app.initialize();
  await app.start();
  return app;
}

export {
  RendererAppOrchestrator,
  createApplication
};
