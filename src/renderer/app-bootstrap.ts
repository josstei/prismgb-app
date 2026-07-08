import { ConsoleLoggerFactory, PlatformBootstrap, safeDispose } from '@platform/core';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import type { LoggerLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import { initializeContainer } from './application/container.js';
import { registerAllowedValuesSource, registerDefaultValueSource } from '@renderer/lib/settings.definitions.js';
import { TRANSCODE_CONFIG } from '@platform/transcode';
import { PRESET_POLICY } from '@platform/gpu';
import { renderAppShell } from './presentation/shell/app-shell.renderer.js';
import type { UIEffects } from './presentation/effects/ui-effects.host.js';
import type {
  RendererUiComponentInstanceMap,
  UiComponentHost
} from './presentation/controller/ui-component.host.js';


class RendererBootstrap extends PlatformBootstrap<RendererServiceContainer, AppOrchestrator> {
  private uiEffects: UIEffects | null;
  private uiComponentHost: UiComponentHost<RendererUiComponentInstanceMap> | null;

  constructor() {
    const loggerFactory = new ConsoleLoggerFactory();
    super(loggerFactory.create('RendererBootstrap') as LoggerLike, {
      alreadyInitialized: 'Renderer application already initialized',
      initializing: 'Initializing renderer application...',
      initialized: 'Renderer application initialized successfully',
      initializeFailed: 'Failed to initialize renderer application:',
      cleanupStart: 'Cleaning up renderer application...',
      cleanupFailed: 'Failed during renderer application cleanup:',
      cleanupComplete: 'Renderer application cleanup complete'
    });
    this.uiEffects = null;
    this.uiComponentHost = null;
  }

  protected async beforeInitialize(): Promise<void> {
    registerAllowedValuesSource('TRANSCODE_CONFIG.formats', () => Object.keys(TRANSCODE_CONFIG.formats));
    registerDefaultValueSource('PRESET_POLICY.rendererDefaultId', () => PRESET_POLICY.rendererDefaultId);

    const appContainer = document.getElementById('appContainer');
    if (appContainer) {
      renderAppShell(appContainer);
    }
  }

  protected createContainer(): RendererServiceContainer {
    return initializeContainer();
  }

  protected async afterContainerCreated(container: RendererServiceContainer): Promise<void> {
    this._initializePresentationPlane(container);
    await this._initializeUIEventBridge(container);
  }

  protected resolveOrchestrator(container: RendererServiceContainer): AppOrchestrator {
    return container.get(TOKENS.appOrchestrator);
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

  protected async cleanupOwnedResources(): Promise<void> {
    if (this.orchestrator) {
      await safeDispose(this.logger, 'orchestrator', this.orchestrator as Object, 'cleanup');
    }

    if (this.uiEffects) {
      await safeDispose(this.logger, 'uiEffects', this.uiEffects);
    }

    if (this.uiComponentHost) {
      await safeDispose(this.logger, 'uiComponentHost', this.uiComponentHost);
    }

    if (this.container) {
      await safeDispose(this.logger, 'container', this.container as Object);
    }
  }

  protected override clearLifecycleState(): void {
    super.clearLifecycleState();
    this.uiEffects = null;
    this.uiComponentHost = null;
  }

  protected override async afterCleanup(): Promise<void> {
    delete document.body.dataset.prismgbAppStarted;
  }

  _initializePresentationPlane(container = this._requireContainer()): void {
    const uiComponentHost = container.get(TOKENS.uiComponentHost);
    const uiEffects = container.get(TOKENS.uiEffects);
    const bodyClassManager = container.get(TOKENS.bodyClassManager);
    const presentationModeStore = container.get(TOKENS.presentationModeStore);

    bodyClassManager.bindPresentationMode(presentationModeStore);

    uiComponentHost.touchCore();
    this.uiComponentHost = uiComponentHost;
    this.uiEffects = uiEffects;
  }

  async _initializeUIEventBridge(container = this._requireContainer()) {
    try {
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
    return this.requireContainer();
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
