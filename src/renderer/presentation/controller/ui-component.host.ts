import type { LoggerFactoryLike, LoggerLike } from '@platform/core';
type UiComponentRegistry<TComponentMap> = {
  readonly [TId in keyof TComponentMap]: {
    readonly deferred: boolean;
    create(own: (component: TComponentMap[TId]) => TComponentMap[TId]): TComponentMap[TId];
  };
};

interface DisposableComponent {
  dispose(): void | Promise<void>;
}

/**
 * Lazily creates and caches UI components from typed factories, tracking resolution order so `dispose()` can
 * unwind components in the reverse order they were constructed.
 */
export class UiComponentHost<TComponentMap extends { [TId in keyof TComponentMap]: DisposableComponent }> {
  private readonly _resolved = new Map<keyof TComponentMap, TComponentMap[keyof TComponentMap]>();
  private readonly _resolutionOrder: (keyof TComponentMap)[] = [];
  private readonly _logger: LoggerLike | undefined;
  private disposal: Promise<void> | null = null;

  constructor(
    private readonly registry: UiComponentRegistry<TComponentMap>,
    loggerFactory?: LoggerFactoryLike | null
  ) {
    this._logger = loggerFactory?.create('UiComponentHost');
  }

  get<TId extends keyof TComponentMap>(id: TId): TComponentMap[TId] {
    if (this.disposal) throw new Error('UI component host has been disposed');
    if (!this._resolved.has(id)) {
      // A factory can establish ownership before mounting so partial initialization rolls back.
      const own = (component: TComponentMap[TId]): TComponentMap[TId] => {
        if (!this._resolved.has(id)) {
          this._resolved.set(id, component);
          this._resolutionOrder.push(id);
        }
        return component;
      };
      own(this.registry[id].create(own));
    }
    return this._resolved.get(id) as TComponentMap[TId];
  }

  touchCore(): void {
    this.touchPhase(false);
  }

  touchDeferred(): void {
    this.touchPhase(true);
  }

  private touchPhase(deferred: boolean): void {
    for (const id of Object.keys(this.registry) as (keyof TComponentMap)[]) {
      if (this.registry[id].deferred === deferred) this.get(id);
    }
  }

  dispose(): Promise<void> {
    return this.disposal ??= this.disposeComponents();
  }

  private async disposeComponents(): Promise<void> {
    const errors: unknown[] = [];
    for (const id of [...this._resolutionOrder].reverse()) {
      const component = this._resolved.get(id);
      if (component) {
        try {
          await component.dispose();
        } catch (error) {
          errors.push(error);
          this._logger?.error(`Error disposing component: ${String(id)}`, error);
        }
      }
    }

    this._resolved.clear();
    this._resolutionOrder.length = 0;
    if (errors.length > 0) throw new AggregateError(errors, 'UI component disposal failed');
  }
}
