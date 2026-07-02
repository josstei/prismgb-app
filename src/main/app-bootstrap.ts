import type { MainServiceContainer } from './application/container.js';
import { createAppContainer } from './application/container.js';
import { MainLogger } from './infrastructure/logging/logger.factory.js';
import type { AppOrchestrator } from './application/app.orchestrator.js';
import type { LoggerLike } from '@platform/core';

export class MainBootstrap {
  private container: MainServiceContainer | null = null;
  private orchestrator: AppOrchestrator | null = null;
  private isInitialized = false;
  private readonly loggerFactory: MainLogger;
  private readonly logger: LoggerLike;

  constructor() {
    this.loggerFactory = new MainLogger();
    this.logger = this.loggerFactory.create('MainBootstrap') as LoggerLike;
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
      this.orchestrator = this.container.resolve<AppOrchestrator>('appOrchestrator');
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
      if (this.container) {
        await this.container.dispose();
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
