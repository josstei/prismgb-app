import { RendererLogger } from '@renderer/infrastructure/logging/logger.factory.js';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { safeDispose } from '@shared/utils/safe-disposer.utils.js';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
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
  _uiEventBridge: UIEventBridge | null;
  _captureUiBridge: CaptureUIBridge | null;
  _transcodeUiBridge: TranscodeUIBridge | null;
  _transcodeService: TranscodeService | null;

  constructor() {
    this.container = null;
    this.orchestrator = null;
    this.isInitialized = false;
    this._uiController = null;
    this._uiEventBridge = null;
    this._captureUiBridge = null;
    this._transcodeUiBridge = null;
    this._transcodeService = null;

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

    if (this._transcodeService) {
      await safeDispose(this.logger, 'TranscodeService', this._transcodeService as Object);
    }
    if (this._transcodeUiBridge) {
      await safeDispose(this.logger, 'TranscodeUIBridge', this._transcodeUiBridge as Object);
    }
    if (this._captureUiBridge) {
      await safeDispose(this.logger, 'CaptureUIBridge', this._captureUiBridge as Object);
    }
    if (this._uiController) {
      await safeDispose(this.logger, 'UIController', this._uiController as Object);
    }

    const appState = this.container?.resolve?.('appState');
    if (appState) {
      await safeDispose(this.logger, 'AppState', appState as Object);
    }

    if (this.container) {
      await safeDispose(this.logger, 'container', this.container as Object);
    }

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
      this._uiEventBridge = uiEventBridge;

      const captureUiBridge = container.resolve('captureUiBridge');
      captureUiBridge.initialize();
      this._captureUiBridge = captureUiBridge;

      const transcodeUiBridge = container.resolve('transcodeUiBridge');
      transcodeUiBridge.initialize();
      this._transcodeUiBridge = transcodeUiBridge;

      const transcodeService = container.resolve('transcodeService');
      transcodeService.initialize();
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
