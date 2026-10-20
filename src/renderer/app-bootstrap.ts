import { ConsoleLoggerFactory, safeDispose, safeDisposeAll, type Logger } from '@platform/core';
import { TRANSCODE_FORMATS } from '@platform/ipc';
import { PRESET_POLICY } from '@platform/gpu';
import type { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import type { RendererServiceContainer } from '@renderer/application/container';
import { TOKENS } from '@renderer/application/di/tokens';
import { registerAllowedValuesSource, registerDefaultValueSource } from '@renderer/lib/settings.definitions';
import { initializeContainer } from './application/container';
import { renderAppShell } from './presentation/shell/app-shell.renderer';

type Disposer = readonly [label: string, dispose: () => unknown];

class RendererBootstrap {
  container: RendererServiceContainer | null = null;
  orchestrator: AppOrchestrator | null = null;
  isInitialized = false;
  readonly logger: Logger = new ConsoleLoggerFactory().create('RendererBootstrap');
  private uiDisposers: Disposer[] = [];

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn('Renderer application already initialized');
      return;
    }

    this.logger.info('Initializing renderer application...');

    try {
      // Settings definitions resolve these sources when they are first read.
      registerAllowedValuesSource('TRANSCODE_FORMATS', () => [...TRANSCODE_FORMATS]);
      registerDefaultValueSource('PRESET_POLICY.rendererDefaultId', () => PRESET_POLICY.rendererDefaultId);

      const appContainer = document.getElementById('appContainer');
      if (appContainer) {
        renderAppShell(appContainer);
      }

      const container = initializeContainer();
      this.container = container;

      this.initializeUi(container);

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

    await safeDispose(this.logger, 'orchestrator', () => this.orchestrator?.cleanup());
    await safeDisposeAll(this.logger, this.uiDisposers);

    this.uiDisposers = [];
    this.orchestrator = null;
    this.container = null;
    delete document.body.dataset.prismgbAppStarted;
    this.isInitialized = false;
    this.logger.info('Renderer application cleanup complete');
  }

  // The body-class effect resolves first so its presentation-mode store subscribes before any component.
  private initializeUi(container: RendererServiceContainer): void {
    const bodyClassEffect = container.get(TOKENS.bodyClassEffect);
    const uiComponentHost = container.get(TOKENS.uiComponentHost);
    uiComponentHost.resolveCore();

    const uiEventBridge = container.get(TOKENS.uiEventBridge);
    uiEventBridge.initialize();
    container.get(TOKENS.transcodeService).initialize();

    const autoHideEffect = container.get(TOKENS.autoHideEffect);
    const feedbackEffect = container.get(TOKENS.feedbackEffect);
    // The bridge unsubscribes first so late domain events cannot reach disposed effects or components.
    this.uiDisposers = [
      ['uiEventBridge', () => uiEventBridge.dispose()],
      ['autoHideEffect', () => autoHideEffect.dispose()],
      ['feedbackEffect', () => feedbackEffect.dispose()],
      ['bodyClassEffect', () => bodyClassEffect.dispose()],
      ['uiComponentHost', () => uiComponentHost.dispose()]
    ];
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
