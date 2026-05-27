import { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { safeDispose } from '@shared/utils/safe-disposer.utils.js';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { LoggerLike } from '@shared/base/service.base.js';

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

  constructor() {
    this.container = null;
    this.orchestrator = null;
    this.isInitialized = false;
    this._uiController = null;

    const loggerFactory = new RendererLogger();
    this.logger = loggerFactory.create('RendererAppOrchestrator') as LoggerLike;
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Renderer application already initialized');
      return;
    }

    this.logger.info('Initializing renderer application...');

    try {
      const { initializeContainer } = await importWithRetry(
        () => import('./application/container')
      );
      const container = initializeContainer();
      this.container = container;

      await this._initializeUI();
      await this._registerUIComponents();
      await this._initializeUIEventBridge();

      const orchestrator = container.resolve('appOrchestrator');
      this.orchestrator = orchestrator;
      await orchestrator.initialize();

      this.isInitialized = true;
      this.logger.info('Renderer application initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize renderer application:', error);
      throw error;
    }
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error('Renderer application not initialized. Call initialize() first.');
    }

    try {
      if (!this.orchestrator) {
        throw new Error('App orchestrator not initialized');
      }
      await this.orchestrator.start();
      document.body.dataset.prismgbAppStarted = 'true';

      this.logger.info('Renderer application started successfully');

    } catch (error) {
      this.logger.error('Failed to start renderer application:', error);
      throw error;
    }
  }

  async cleanup() {
    this.logger.info('Cleaning up renderer application...');

    if (this.orchestrator) {
      await safeDispose(this.logger, 'orchestrator', this.orchestrator as Object, 'cleanup');
    }

    if (this._uiController) {
      await safeDispose(this.logger, 'uiController', this._uiController);
    }

    if (this.container) {
      await safeDispose(this.logger, 'container', this.container as Object);
    }

    this.orchestrator = null;
    this.container = null;
    this._uiController = null;
    delete document.body.dataset.prismgbAppStarted;
    this.isInitialized = false;
    this.logger.info('Renderer application cleanup complete');
  }

  async _initializeUI() {
    const container = this._requireContainer();

    const uiComponentRegistry = container.resolve('uiComponentRegistry');
    const uiEffects = container.resolve('uiEffects');
    const bodyClassManager = container.resolve('bodyClassManager');
    const loggerFactory = container.resolve('loggerFactory');

    const uiController = new UIController({
      uiComponentRegistry,
      uiEffects,
      bodyClassManager,
      loggerFactory
    });

    uiEffects.setElements(uiController.elements);
    uiController.initializeComponents();
    this._uiController = uiController;
  }

  async _registerUIComponents() {
    const { asValue } = await importWithRetry(() => import('./application/container'));
    const container = this._requireContainer();

    container.register({
      uiController: asValue(this._uiController as UIController)
    });
  }

  async _initializeUIEventBridge() {
    try {
      const container = this._requireContainer();
      const uiEventBridge = container.resolve('uiEventBridge');
      uiEventBridge.initialize();

      const captureUiBridge = container.resolve('captureUiBridge');
      captureUiBridge.initialize();

      const transcodeUiBridge = container.resolve('transcodeUiBridge');
      transcodeUiBridge.initialize();

      const transcodeService = container.resolve('transcodeService');
      transcodeService.initialize();
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
