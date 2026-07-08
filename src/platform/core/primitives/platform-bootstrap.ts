import type { LoggerLike } from './service.base.js';

export interface PlatformBootstrapMessages {
  alreadyInitialized: string;
  initializing: string;
  initialized: string;
  initializeFailed: string;
  cleanupStart: string;
  cleanupFailed: string;
  cleanupComplete?: string;
  cleanupSkipped?: string;
}

export abstract class PlatformBootstrap<TContainer, TOrchestrator> {
  container: TContainer | null = null;
  orchestrator: TOrchestrator | null = null;
  isInitialized = false;

  protected constructor(
    protected readonly logger: LoggerLike,
    private readonly messages: PlatformBootstrapMessages
  ) {}

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn(this.messages.alreadyInitialized);
      return;
    }

    this.logger.info(this.messages.initializing);

    try {
      await this.beforeInitialize();
      const container = await this.createContainer();
      this.container = container;
      await this.afterContainerCreated(container);

      const orchestrator = this.resolveOrchestrator(container);
      this.orchestrator = orchestrator;
      await this.initializeOrchestrator(orchestrator);

      this.isInitialized = true;
      this.logger.info(this.messages.initialized);
      await this.afterInitialize();
    } catch (error) {
      this.logger.error(this.messages.initializeFailed, error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (!this.isInitialized && this.messages.cleanupSkipped) {
      this.logger.info(this.messages.cleanupSkipped);
      return;
    }

    this.logger.info(this.messages.cleanupStart);

    try {
      await this.cleanupOwnedResources();
      this.clearLifecycleState();
      await this.afterCleanup();
      if (this.messages.cleanupComplete) {
        this.logger.info(this.messages.cleanupComplete);
      }
    } catch (error) {
      this.logger.error(this.messages.cleanupFailed, error);
      throw error;
    }
  }

  protected async beforeInitialize(): Promise<void> {}

  protected async afterContainerCreated(_container: TContainer): Promise<void> {}

  protected async afterInitialize(): Promise<void> {}

  protected async initializeOrchestrator(orchestrator: TOrchestrator): Promise<void> {
    const lifecycle = orchestrator as { initialize?: () => void | Promise<void> };
    await lifecycle.initialize?.();
  }

  protected async afterCleanup(): Promise<void> {}

  protected clearLifecycleState(): void {
    this.isInitialized = false;
    this.orchestrator = null;
    this.container = null;
  }

  protected requireContainer(): TContainer {
    if (!this.container) {
      throw new Error('Container not initialized');
    }
    return this.container;
  }

  protected abstract createContainer(): TContainer | Promise<TContainer>;

  protected abstract resolveOrchestrator(container: TContainer): TOrchestrator;

  protected abstract cleanupOwnedResources(): Promise<void>;
}
