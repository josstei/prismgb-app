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
import { UIController } from '@renderer/ui/controller/ui.class.js';

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
      // 1. Create DI container (NEW ARCHITECTURE)
      const { initializeContainer } = await import('./container.js');
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

    try {
      if (this.orchestrator) {
        await this.orchestrator.cleanup();
      }
    } catch (error) {
      this.logger.error('Error cleaning up orchestrator:', error);
    }

    try {
      if (this._captureUiBridge) {
        this._captureUiBridge.dispose();
      }
    } catch (error) {
      this.logger.error('Error disposing CaptureUiBridge:', error);
    }

    try {
      // Clean up UIController (event listeners)
      if (this._uiController && typeof this._uiController.dispose === 'function') {
        this._uiController.dispose();
      }
    } catch (error) {
      this.logger.error('Error disposing UIController:', error);
    }

    // Clean up AppState EventBus subscriptions
    try {
      const appState = this.container?.resolve('appState');
      if (appState && typeof appState.dispose === 'function') {
        appState.dispose();
      }
    } catch (error) {
      this.logger.error('Error disposing AppState:', error);
    }

    try {
      if (this.container) {
        this.container.dispose();
      }
    } catch (error) {
      this.logger.error('Error disposing container:', error);
    }

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
    const { asValue } = await import('./container.js');

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
