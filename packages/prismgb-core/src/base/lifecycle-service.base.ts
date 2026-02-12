import { BaseService } from './service.base';
import type { ILifecycle, IEventSubscriber } from '../interfaces/lifecycle.interface';
import type { EventBusLike } from '../interfaces/infrastructure.types';

type LifecycleDependencies = Record<string, any>;

export abstract class LifecycleService<
  TDependencies extends LifecycleDependencies = LifecycleDependencies
> extends BaseService<TDependencies> implements ILifecycle, IEventSubscriber {
  protected _subscriptions: (() => void)[] = [];
  private _isInitialized = false;
  private _isDisposed = false;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      this.logger?.warn(`${this._serviceName} already initialized`);
      return;
    }

    this.logger?.info(`Initializing ${this._serviceName}`);

    try {
      await this.onInitialize();
      this._isInitialized = true;
      this._isDisposed = false;
      this.logger?.info(`${this._serviceName} initialized`);
    } catch (error) {
      this.logger?.error(`${this._serviceName} initialization failed`, error);
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this._isDisposed) {
      this.logger?.debug(`${this._serviceName} already disposed`);
      return;
    }

    this.logger?.info(`Disposing ${this._serviceName}`);

    this._cleanupSubscriptions();

    try {
      await this.onDispose();
    } catch (error) {
      this.logger?.error(`${this._serviceName} dispose failed`, error);
    }

    this._isInitialized = false;
    this._isDisposed = true;
  }

  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void {
    const eventBus = this.eventBus as EventBusLike | undefined;
    if (!eventBus) {
      this.logger?.warn('Cannot subscribe - eventBus not available');
      return;
    }

    for (const [event, handler] of Object.entries(eventMap)) {
      const unsubscribe = eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  protected async onDispose(): Promise<void> {
    // Override in subclasses
  }

  private _cleanupSubscriptions(): void {
    for (const unsubscribe of this._subscriptions) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this._subscriptions = [];
  }
}
