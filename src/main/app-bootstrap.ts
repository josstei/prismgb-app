import type { MainServiceContainer } from './application/container.js';
import { createAppContainer } from './application/container.js';
import { MainLogger } from './infrastructure/logging/logger.factory.js';
import type { AppOrchestrator } from './application/app.orchestrator.js';
import { TOKENS } from './application/di/tokens.js';
import { PlatformBootstrap, type LoggerLike } from '@platform/core';

export class MainBootstrap extends PlatformBootstrap<MainServiceContainer, AppOrchestrator> {
  private readonly loggerFactory: MainLogger;

  constructor() {
    const loggerFactory = new MainLogger();
    super(loggerFactory.create('MainBootstrap') as LoggerLike, {
      alreadyInitialized: 'Main application already initialized',
      initializing: 'Initializing main application...',
      initialized: 'Main application initialized successfully',
      initializeFailed: 'Failed to initialize main application:',
      cleanupStart: 'Shutting down main application...',
      cleanupFailed: 'Failed during main application cleanup:',
      cleanupSkipped: 'Main application not initialized; skipping cleanup'
    });
    this.loggerFactory = loggerFactory;
  }

  protected async createContainer(): Promise<MainServiceContainer> {
    return createAppContainer(this.loggerFactory);
  }

  protected resolveOrchestrator(container: MainServiceContainer): AppOrchestrator {
    return container.get(TOKENS.appOrchestrator);
  }

  protected async cleanupOwnedResources(): Promise<void> {
    if (this.orchestrator) {
      await this.orchestrator.cleanup();
    }
  }

  getContainer(): MainServiceContainer | null {
    return this.container;
  }
}
