import { validateDependencies } from './validate-deps.utils.js';
import type { LoggerLike } from './service.base.js';

type Unsubscribe = () => void;

interface EventBusLike {
  subscribe(event: string, handler: (...args: unknown[]) => void): Unsubscribe;
  publish(event: string, data?: unknown): void;
}

interface LoggerFactoryLike {
  create(name: string): LoggerLike;
}

export class BaseOrchestrator {
  protected logger!: LoggerLike;
  protected eventBus!: EventBusLike;
  isInitialized: boolean;
  protected _isCleanedUp: boolean;
  protected readonly _orchestratorName: string;
  private _subscriptions: Unsubscribe[];

  constructor(
    dependencies: object,
    requiredDeps: string[] = [],
    name: string | null = null
  ) {
    const orchestratorName = name || this.constructor.name;
    validateDependencies(dependencies, requiredDeps, orchestratorName);
    const dependencyMap = dependencies as Record<string, unknown>;

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(orchestratorName);
    }

    this.isInitialized = false;
    this._isCleanedUp = false;
    this._orchestratorName = orchestratorName;
    this._subscriptions = [];
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger?.warn(`${this._orchestratorName} already initialized`);
      return;
    }

    this.logger?.info(`Initializing ${this._orchestratorName}`);

    try {
      await this.onInitialize();

      this.isInitialized = true;
      this._isCleanedUp = false;
      this.logger?.info(`${this._orchestratorName} initialized`);
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} initialization failed`, error);
      throw error;
    }
  }

  async onInitialize(): Promise<void> {}

  async cleanup(): Promise<void> {
    if (this._isCleanedUp) {
      this.logger?.debug(`${this._orchestratorName} already cleaned up`);
      return;
    }

    this.logger?.info(`Cleaning up ${this._orchestratorName}`);
    this._cleanupSubscriptions();

    try {
      await this.onCleanup();
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} cleanup failed`, error);
    }

    this.isInitialized = false;
    this._isCleanedUp = true;
  }

  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void {
    const eventBus = this.eventBus;
    if (!eventBus) {
      this.logger?.warn('Cannot subscribe - eventBus not available');
      return;
    }

    Object.entries(eventMap).forEach(([event, handler]) => {
      const unsubscribe = eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    });
  }

  protected _cleanupSubscriptions(): void {
    this._subscriptions.forEach((unsubscribe) => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
    this._subscriptions = [];
  }

  async onCleanup(): Promise<void> {}
}
