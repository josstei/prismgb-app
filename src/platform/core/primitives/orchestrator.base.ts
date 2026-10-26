import { disposeInOrder } from './application-lifecycle.js';
import { ManagedLifecycleHost, type EventTargetLike } from './managed-lifecycle-host.js';
import { getEventHandlerBindings } from './event-decorator.js';
import type { DisposableFunction } from './disposable-bag.js';
import type { EventBusLike, LifecycleDependencies, LoggerLike } from './service.base.js';

export class BaseOrchestrator extends ManagedLifecycleHost {
  protected logger!: LoggerLike;
  protected eventBus: EventBusLike | undefined;
  isInitialized: boolean;
  private _initialization: Promise<void> | null = null;
  private _cleanup: Promise<void> | null = null;
  protected readonly _orchestratorName: string;

  constructor({ eventBus, loggerFactory }: LifecycleDependencies, name: string | null = null) {
    super();
    const orchestratorName = name || this.constructor.name;
    this.eventBus = eventBus ?? undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(orchestratorName);
    }

    this.isInitialized = false;
    this._orchestratorName = orchestratorName;
  }

  initialize(): Promise<void> {
    if (this._initialization) return this._initialization;
    this._initialization = this._initialize().finally(() => { this._initialization = null; });
    return this._initialization;
  }

  private async _initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger?.warn(`${this._orchestratorName} already initialized`);
      return;
    }

    this.logger?.info(`Initializing ${this._orchestratorName}`);

    try {
      this._subscribeDeclaredEventHandlers();
      await this.onInitialize();

      this.isInitialized = true;
      this._cleanup = null;
      this.logger?.info(`${this._orchestratorName} initialized`);
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} initialization failed`, error);
      await this._cleanupLifecycle();
      throw error;
    }
  }

  async onInitialize(): Promise<void> {}

  cleanup(): Promise<void> {
    return this._cleanup ??= Promise.resolve().then(async () => {
      this.logger?.info(`Cleaning up ${this._orchestratorName}`);
      try {
        await disposeInOrder([() => this.onCleanup(), () => super.dispose()]);
      } finally {
        this.isInitialized = false;
      }
    });
  }

  override dispose(): Promise<void> {
    return this.cleanup();
  }

  private _subscribeDeclaredEventHandlers(): void {
    const bindings = getEventHandlerBindings(this.constructor);
    if (bindings.length === 0) {
      return;
    }

    const eventBus = this.eventBus;
    if (!eventBus) {
      this.logger?.warn('Cannot subscribe - eventBus not available');
      return;
    }

    const handlers = this as unknown as Record<string | symbol, (payload: unknown) => void | Promise<void>>;
    for (const { channel, methodKey } of bindings) {
      this.track(eventBus.subscribe(channel, (payload: unknown) => handlers[methodKey](payload)));
    }
  }

  protected listen(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.subscribeEvent(target, type, listener, options);
  }

  protected async _cleanupLifecycle(): Promise<void> {
    try {
      await super.dispose();
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} lifecycle cleanup failed`, error);
    }
  }

  async onCleanup(): Promise<void> {}
}
