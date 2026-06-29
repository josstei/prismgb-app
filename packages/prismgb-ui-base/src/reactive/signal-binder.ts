import type { DisposableFunction } from '@prismgb/core';
import type { ReadonlySignal } from './signal.js';
import { bindText, bindClass, bindVisible, bindAttr, bindProperty } from './dom-bindings.js';

type Tracker = (disposer: DisposableFunction) => unknown;

/** Fluent binder that registers every binding's teardown on a tracker (DisposableBag/component). */
export class SignalBinder {
  constructor(private readonly track: Tracker) {}

  text(element: Parameters<typeof bindText>[0], source: ReadonlySignal<unknown>, format?: Parameters<typeof bindText>[2]): this {
    this.track(bindText(element, source, format));
    return this;
  }

  class(element: Parameters<typeof bindClass>[0], token: string, source: ReadonlySignal<boolean>): this {
    this.track(bindClass(element, token, source));
    return this;
  }

  visible(element: Parameters<typeof bindVisible>[0], source: ReadonlySignal<boolean>, hiddenToken?: string): this {
    this.track(bindVisible(element, source, hiddenToken));
    return this;
  }

  attr(element: Parameters<typeof bindAttr>[0], name: string, source: ReadonlySignal<string | null | undefined>): this {
    this.track(bindAttr(element, name, source));
    return this;
  }

  property<TElement extends object, TKey extends keyof TElement>(
    element: TElement | null,
    key: TKey,
    source: ReadonlySignal<TElement[TKey]>
  ): this {
    this.track(bindProperty(element, key, source));
    return this;
  }
}
