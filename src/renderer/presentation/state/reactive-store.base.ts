import { DisposableBag } from '@platform/core';
import type { Disposable, DisposableFunction } from '@platform/core';

/**
 * Minimal disposal harness shared by the presentation stores: subscriptions
 * registered through track() are released together when the store disposes.
 */
export abstract class ReactiveStore {
  private readonly disposables = new DisposableBag();

  protected track(disposable: Disposable): DisposableFunction {
    return this.disposables.add(disposable);
  }

  dispose(): void | Promise<void> {
    return this.disposables.clear();
  }
}
