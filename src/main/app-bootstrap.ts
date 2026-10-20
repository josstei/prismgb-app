import type { MainServiceContainer } from './application/container';
import { createAppContainer } from './application/container';
import { MainLogger } from './infrastructure/logging/logger.factory';
import type { AppOrchestrator } from './application/app.orchestrator';
import { TOKENS } from './application/di/tokens';
import type { Logger } from '@platform/core';

export class MainBootstrap {
  private container: MainServiceContainer | null = null;
  private orchestrator: AppOrchestrator | null = null;
  private isInitialized = false;
  private readonly loggerFactory: MainLogger;
  private readonly logger: Logger;

  constructor() {
    this.loggerFactory = new MainLogger();
    this.logger = this.loggerFactory.create('MainBootstrap');
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Main application already initialized');
      return;
    }

    this.logger.info('Initializing main application...');

    try {
      // Create DI container with shared logger factory
      this.container = await createAppContainer(this.loggerFactory);

      // Resolve and initialize AppOrchestrator
      this.orchestrator = this.container.get(TOKENS.appOrchestrator);
      await this.orchestrator.initialize();

      this.isInitialized = true;
      this.logger.info('Main application initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize main application:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      this.logger.info('Main application not initialized; skipping cleanup');
      return;
    }

    this.logger.info('Shutting down main application...');
    try {
      if (this.orchestrator) {
        await this.orchestrator.cleanup();
      }
      this.isInitialized = false;
      this.orchestrator = null;
      this.container = null;
    } catch (error) {
      this.logger.error('Failed during main application cleanup:', error);
      throw error;
    }
  }

  getContainer(): MainServiceContainer | null {
    return this.container;
  }
}
