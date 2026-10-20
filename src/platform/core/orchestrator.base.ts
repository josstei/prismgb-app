import { BaseService, type EventSource } from './service.base';
import type { LoggerFactory } from './logger';

export abstract class BaseOrchestrator extends BaseService {
  isInitialized = false;
  private isCleanedUp = false;
  private isCleaningUp = false;

  constructor(
    loggerFactory: LoggerFactory,
    private readonly name: string,
    private readonly eventSource: EventSource | null = null
  ) {
    super(loggerFactory, name);
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn(`${this.name} already initialized`);
      return;
    }

    this.logger.info(`Initializing ${this.name}`);

    try {
      if (this.eventSource) {
        this.bindEventHandlers(this.eventSource);
      }
      await this.onInitialize();

      this.isInitialized = true;
      this.isCleanedUp = false;
      this.logger.info(`${this.name} initialized`);
    } catch (error) {
      this.logger.error(`${this.name} initialization failed`, error);
      throw error;
    }
  }

  async onInitialize(): Promise<void> {}

  async cleanup(): Promise<void> {
    if (this.isCleanedUp || this.isCleaningUp) {
      this.logger.debug(`${this.name} already cleaned up`);
      return;
    }

    this.isCleaningUp = true;
    this.logger.info(`Cleaning up ${this.name}`);

    try {
      await this.onCleanup();
    } catch (error) {
      this.logger.error(`${this.name} cleanup failed`, error);
    }

    try {
      await this.dispose();
    } catch (error) {
      this.logger.error(`${this.name} lifecycle cleanup failed`, error);
    }

    this.isInitialized = false;
    this.isCleanedUp = true;
    this.isCleaningUp = false;
  }

  async onCleanup(): Promise<void> {}
}
