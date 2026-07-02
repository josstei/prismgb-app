import { ConsoleLoggerFactory } from '@prismgb/core';
import { UIController } from '@renderer/presentation/controller/ui.controller.js';
import { safeDispose } from '@prismgb/core';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';
import type { UIComponentRegistry } from '@renderer/presentation/controller/component.registry';
import type { UIEffects } from '@renderer/presentation/effects/ui-effects.class';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class.class';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { initializeContainer } from './application/container.js';
import { registerAllowedValuesSource, registerDefaultValueSource } from '@renderer/lib/settings.definitions.js';
import { TRANSCODE_CONFIG } from '@prismgb/transcode';
import { PRESET_POLICY } from '@prismgb/gpu';
import { renderAppShell } from './presentation/shell/app-shell.renderer.js';
import { PresentationModeStore } from './presentation/state/presentation-mode.store.js';



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

      const orchestrator = container.resolve<AppOrchestrator>('appOrchestrator');
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

    const uiComponentRegistry = container.resolve<UIComponentRegistry<any>>('uiComponentRegistry');
    const uiEffects = container.resolve<UIEffects>('uiEffects');
    const bodyClassManager = container.resolve<BodyClassManager>('bodyClassManager');
    const loggerFactory = container.resolve<LoggerFactoryLike>('loggerFactory');
    const eventBus = container.resolve<EventBusLike>('eventBus');
    const appState = container.resolve<any>('appState');

    const presentationModeStore = new PresentationModeStore({
      eventBus,
      cinematicEnabled: appState.cinematicModeSignal
    });
    bodyClassManager.bindPresentationMode(presentationModeStore);

    const uiController = new UIController({
      uiComponentRegistry,
      uiEffects,
      bodyClassManager,
      loggerFactory,
      eventBus,
      appState
    });

    uiEffects.setElements(uiController.elements);
    uiController.initializeComponents();
    this._uiController = uiController;
  }

  async _registerUIComponents() {
    const container = this._requireContainer();

    container.registerValue('uiController', this._uiController as UIController);
  }

  async _initializeUIEventBridge() {
    try {
      const container = this._requireContainer();
      const uiEventBridge = container.resolve<UIEventBridge>('uiEventBridge');
      uiEventBridge.initialize();

      const captureUiBridge = container.resolve<CaptureUIBridge>('captureUiBridge');
      captureUiBridge.initialize();

      const transcodeUiBridge = container.resolve<TranscodeUIBridge>('transcodeUiBridge');
      transcodeUiBridge.initialize();

      const transcodeService = container.resolve<TranscodeService>('transcodeService');
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
