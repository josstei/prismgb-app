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
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { UpdateUIBridge } from '@renderer/presentation/bridges/update-ui.bridge';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import type { LoggerLike } from '@prismgb/core';

/**
 * Retry a dynamic import with exponential backoff
 * @param {() => Promise<T>} importFn - Function that returns the import promise
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelayMs - Base delay between retries (doubles each attempt)
 * @returns {Promise<T>}
 */
async function importWithRetry<T>(importFn: () => Promise<T>, maxRetries = 3, baseDelayMs = 300): Promise<T> {
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
  container: RendererServiceContainer | null;
  orchestrator: AppOrchestrator | null;
  isInitialized: boolean;
  logger: LoggerLike;
  _uiController: UIController | null;
  _uiEventBridge: UIEventBridge | null;
  _captureUiBridge: CaptureUIBridge | null;
  _transcodeUiBridge: TranscodeUIBridge | null;
  _updateUiBridge: UpdateUIBridge | null;
  _transcodeService: TranscodeService | null;

  constructor() {
    this.container = null;
    this.orchestrator = null;
    this.isInitialized = false;
    this._uiController = null;
    this._uiEventBridge = null;
    this._captureUiBridge = null;
    this._transcodeUiBridge = null;
    this._updateUiBridge = null;
    this._transcodeService = null;

    // Create logger for bootstrap logging
    const loggerFactory = new RendererLogger();
    this.logger = loggerFactory.create('RendererAppOrchestrator') as LoggerLike;
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
        () => import('./application/container')
      );
      const container = initializeContainer();
      this.container = container;

      // 2. Initialize UI components (not managed by DI)
      await this._initializeUI();

      // 3. Register UI components in container
      await this._registerUIComponents();

      // 4. Initialize UI event bridge (bridges events to UIController)
      await this._initializeUIEventBridge();

      // 5. Resolve orchestrator (this will wire everything up)
      const orchestrator = container.resolve('appOrchestrator');
      this.orchestrator = orchestrator;

      // 6. Initialize orchestrator
      await orchestrator.initialize();

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
      if (!this.orchestrator) {
        throw new Error('App orchestrator not initialized');
      }
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
      const { resetContainer } = await importWithRetry(
        () => import('./application/container')
      );
      await resetContainer();
    } catch (error) {
      this.logger.error('Failed to cleanup renderer container:', error);
    }

    this.container = null;
    this.orchestrator = null;
    this._uiController = null;
    this._uiEventBridge = null;
    this._captureUiBridge = null;
    this._transcodeUiBridge = null;
    this._updateUiBridge = null;
    this._transcodeService = null;
    this.isInitialized = false;
    this.logger.info('Renderer application cleanup complete');
  }

  /**
   * Initialize UI components (not managed by DI)
   * @private
   */
  async _initializeUI() {
    const container = this._requireContainer();

    // Get dependencies from DI
    const uiComponentRegistry = container.resolve('uiComponentRegistry');
    const uiEffects = container.resolve('uiEffects');
    const bodyClassManager = container.resolve('bodyClassManager');
    const loggerFactory = container.resolve('loggerFactory');

    // Create UIController with new dependencies
    const uiController = new UIController({
      uiComponentRegistry,
      uiEffects,
      bodyClassManager,
      loggerFactory
    });

    // Wire up elements to UIEffects after UIController creates them
    uiEffects.elements = uiController.elements as Record<string, HTMLElement | null>;

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
    const { asValue } = await importWithRetry(() => import('./application/container'));
    const container = this._requireContainer();

    // Register UI components as values (already instantiated)
    container.register({
      uiController: asValue(this._uiController as UIController)
    });
  }

  /**
   * Initialize UI event bridge
   * @private
   */
  async _initializeUIEventBridge() {
    try {
      const container = this._requireContainer();
      const uiEventBridge = container.resolve('uiEventBridge');
      await uiEventBridge.initialize();
      this._uiEventBridge = uiEventBridge;

      const captureUiBridge = container.resolve('captureUiBridge');
      await captureUiBridge.initialize();
      this._captureUiBridge = captureUiBridge;

      const transcodeUiBridge = container.resolve('transcodeUiBridge');
      await transcodeUiBridge.initialize();
      this._transcodeUiBridge = transcodeUiBridge;

      const updateUiBridge = container.resolve('updateUiBridge');
      await updateUiBridge.initialize();
      this._updateUiBridge = updateUiBridge;

      // Initialize TranscodeService to set up IPC event listeners
      const transcodeService = container.resolve('transcodeService');
      await transcodeService.initialize();
      this._transcodeService = transcodeService;
    } catch (error) {
      this.logger.error('Failed to initialize UI event bridge:', error);
      throw error;
    }
  }

  _requireContainer(): RendererServiceContainer {
    if (!this.container) {
      throw new Error('Container not initialized');
    }
    return this.container;
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
