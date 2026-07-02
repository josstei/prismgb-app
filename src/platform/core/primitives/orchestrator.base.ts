import { DisposableBag, type Disposable, type DisposableFunction, type DisposableKey, type EventTargetLike } from './disposable-bag.js';
import type { EventBusLike, LoggerFactoryLike, LoggerLike } from './service.base.js';

export class BaseOrchestrator {
  protected logger!: LoggerLike;
  protected eventBus!: EventBusLike;
  isInitialized: boolean;
  protected _isCleanedUp: boolean;
  protected _isCleaningUp: boolean;
  protected readonly _orchestratorName: string;
  private readonly _disposables: DisposableBag;

  constructor(dependencies: object, name: string | null = null) {
    const orchestratorName = name || this.constructor.name;
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(orchestratorName);
    }

    this.isInitialized = false;
    this._isCleanedUp = false;
    this._isCleaningUp = false;
    this._orchestratorName = orchestratorName;
    this._disposables = new DisposableBag();
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
    if (this._isCleanedUp || this._isCleaningUp) {
      this.logger?.debug(`${this._orchestratorName} already cleaned up`);
      return;
    }

    this._isCleaningUp = true;
    this.logger?.info(`Cleaning up ${this._orchestratorName}`);

    try {
      await this.onCleanup();
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} cleanup failed`, error);
    }

    await this._cleanupLifecycle();

    this.isInitialized = false;
    this._isCleanedUp = true;
    this._isCleaningUp = false;
  }

  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void | Promise<void>>): void {
    const eventBus = this.eventBus;
    if (!eventBus) {
      this.logger?.warn('Cannot subscribe - eventBus not available');
      return;
    }

    Object.entries(eventMap).forEach(([event, handler]) => {
      const unsubscribe = eventBus.subscribe(event, handler);
      this.track(unsubscribe);
    });
  }

  protected listen(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this._disposables.addEvent(target, type, listener, options);
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this._disposables.add(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this._disposables.replace(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  protected async _cleanupLifecycle(): Promise<void> {
    try {
      await this._disposables.clear();
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} lifecycle cleanup failed`, error);
    }
  }

  async onCleanup(): Promise<void> {}
}
