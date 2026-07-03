import { ConsoleLoggerFactory } from '@platform/core';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { safeDispose } from '@platform/core';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { LoggerLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import { initializeContainer } from './application/container.js';
import { registerAllowedValuesSource, registerDefaultValueSource } from '@renderer/lib/settings.definitions.js';
import { TRANSCODE_CONFIG } from '@platform/transcode';
import { PRESET_POLICY } from '@platform/gpu';
import { renderAppShell } from './presentation/shell/app-shell.renderer.js';



class RendererBootstrap {
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

    const loggerFactory = new ConsoleLoggerFactory();
    this.logger = loggerFactory.create('RendererBootstrap') as LoggerLike;
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Renderer application already initialized');
      return;
    }

    this.logger.info('Initializing renderer application...');

    try {
      // Register settings options dynamically before resolving definitions
      registerAllowedValuesSource('TRANSCODE_CONFIG.formats', () => Object.keys(TRANSCODE_CONFIG.formats));
      registerDefaultValueSource('PRESET_POLICY.rendererDefaultId', () => PRESET_POLICY.rendererDefaultId);

      // Render templates into app container
      const appContainer = document.getElementById('appContainer');
      if (appContainer) {
        renderAppShell(appContainer);
      }

      const container = initializeContainer();
      this.container = container;

      await this._initializeUI();
      await this._registerUIComponents();
      await this._initializeUIEventBridge();

      const orchestrator = container.get(TOKENS.appOrchestrator);
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

    const uiComponentHost = container.get(TOKENS.uiComponentHost);
    const domBindings = container.get(TOKENS.domBindings);
    const uiEffects = container.get(TOKENS.uiEffects);
    const bodyClassManager = container.get(TOKENS.bodyClassManager);
    const loggerFactory = container.get(TOKENS.loggerFactory);

    const presentationModeStore = container.get(TOKENS.presentationModeStore);
    bodyClassManager.bindPresentationMode(presentationModeStore);

    const uiController = new UIController({
      uiComponentHost,
      domBindings,
      uiEffects,
      loggerFactory
    });

    uiEffects.setElements(uiController.elements);
    uiController.initializeComponents();
    this._uiController = uiController;
  }

  async _registerUIComponents() {
    const container = this._requireContainer();

    container.bind(TOKENS.uiController).toConstantValue(this._uiController as UIController);
  }

  async _initializeUIEventBridge() {
    try {
      const container = this._requireContainer();
      const uiEventBridge = container.get(TOKENS.uiEventBridge);
      uiEventBridge.initialize();

      const captureUiBridge = container.get(TOKENS.captureUiBridge);
      captureUiBridge.initialize();

      const transcodeUiBridge = container.get(TOKENS.transcodeUiBridge);
      transcodeUiBridge.initialize();

      const transcodeService = container.get(TOKENS.transcodeService);
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
  const app = new RendererBootstrap();
  await app.initialize();
  await app.start();
  return app;
}

export {
  RendererBootstrap,
  createApplication
};
