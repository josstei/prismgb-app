import { BaseService } from './service.base.js';
import type { ILifecycle, IEventSubscriber } from '../interfaces/lifecycle.interface';
import type { EventBusLike, LoggerLike } from '../interfaces/infrastructure.types';

type ServiceContext = {
  logger?: LoggerLike;
  eventBus?: EventBusLike;
};

export abstract class LifecycleService extends BaseService implements ILifecycle, IEventSubscriber {
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
      (this as unknown as ServiceContext).logger?.warn(
        `${this._serviceName} already initialized`
      );
      return;
    }

    (this as unknown as ServiceContext).logger?.info(
      `Initializing ${this._serviceName}`
    );

    try {
      await this.onInitialize();
      this._isInitialized = true;
      this._isDisposed = false;
      (this as unknown as ServiceContext).logger?.info(
        `${this._serviceName} initialized`
      );
    } catch (error) {
      (this as unknown as ServiceContext).logger?.error(
        `${this._serviceName} initialization failed`,
        error
      );
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this._isDisposed) {
      (this as unknown as ServiceContext).logger?.debug(
        `${this._serviceName} already disposed`
      );
      return;
    }

    (this as unknown as ServiceContext).logger?.info(
      `Disposing ${this._serviceName}`
    );

    this._cleanupSubscriptions();

    try {
      await this.onDispose();
    } catch (error) {
      (this as unknown as ServiceContext).logger?.error(
        `${this._serviceName} dispose failed`,
        error
      );
    }

    this._isInitialized = false;
    this._isDisposed = true;
  }

  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void {
    const eventBus = (this as unknown as ServiceContext).eventBus;
    if (!eventBus) {
      (this as unknown as ServiceContext).logger?.warn(
        'Cannot subscribe - eventBus not available'
      );
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
