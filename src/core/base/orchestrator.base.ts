import { BaseService, BaseServiceDependencies } from './service.base';
import type { IDisposable } from './disposable.interface';

/**
 * EventBus interface expected by BaseOrchestrator.
 */
export interface IEventBus {
  subscribe(event: string, handler: (...args: unknown[]) => void): () => void;
  publish(event: string, ...args: unknown[]): void;
}

/**
 * Dependencies required by BaseOrchestrator.
 */
export interface BaseOrchestratorDependencies extends BaseServiceDependencies {
  eventBus?: IEventBus;
}

/**
 * Event subscription map for subscribeWithCleanup.
 */
export type EventSubscriptionMap = Record<string, (...args: unknown[]) => void>;

/**
 * Base class for orchestrators providing:
 * - Lifecycle management (initialize/cleanup)
 * - Event subscription tracking with automatic cleanup
 */
export abstract class BaseOrchestrator extends BaseService implements IDisposable {
  private _isInitialized = false;
  private _isCleanedUp = false;
  private readonly _subscriptions: Array<() => void> = [];

  protected eventBus?: IEventBus;

  constructor(
    dependencies: BaseOrchestratorDependencies,
    requiredDeps: string[] = [],
    name: string
  ) {
    super(dependencies, requiredDeps, name);
    this.eventBus = dependencies.eventBus;
  }

  /**
   * Whether the orchestrator has been initialized.
   */
  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the orchestrator.
   * Calls onInitialize() for subclass-specific initialization.
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) {
      this.logger?.warn(`${this._serviceName} already initialized`);
      return;
    }

    this.logger?.debug(`Initializing ${this._serviceName}`);
    await this.onInitialize();
    this._isInitialized = true;
    this.logger?.debug(`${this._serviceName} initialized`);
  }

  /**
   * Cleanup the orchestrator.
   * Unsubscribes all tracked subscriptions and calls onCleanup().
   */
  async cleanup(): Promise<void> {
    if (this._isCleanedUp) {
      return;
    }

    this.logger?.debug(`Cleaning up ${this._serviceName}`);

    // Unsubscribe all tracked subscriptions
    for (const unsubscribe of this._subscriptions) {
      try {
        unsubscribe();
      } catch (error) {
        this.logger?.error(`Error unsubscribing in ${this._serviceName}`, error);
      }
    }
    this._subscriptions.length = 0;

    await this.onCleanup();
    this._isCleanedUp = true;
    this._isInitialized = false;
    this.logger?.debug(`${this._serviceName} cleaned up`);
  }

  /**
   * Alias for cleanup() to satisfy IDisposable.
   */
  async dispose(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Subscribe to multiple events with automatic cleanup tracking.
   * @param eventMap - Map of event names to handlers
   */
  protected subscribeWithCleanup(eventMap: EventSubscriptionMap): void {
    if (!this.eventBus) {
      this.logger?.warn(`${this._serviceName}: No eventBus available for subscriptions`);
      return;
    }

    for (const [event, handler] of Object.entries(eventMap)) {
      const unsubscribe = this.eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  /**
   * Override in subclass for custom initialization logic.
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Override in subclass for custom cleanup logic.
   */
  protected abstract onCleanup(): Promise<void>;
}
