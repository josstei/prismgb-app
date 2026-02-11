import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';

type LifecycleOptions = {
  onEnable?: () => void;
  onDisable?: () => void;
};

type DomListenerManager = {
  add(
    target: ListenerTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeAll(): void;
};

type RafThrottleState = {
  _mouseMoveFramePending: boolean;
  _rafId: number | null;
};

type ListenerTarget = EventTarget & {
  addEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ) => void;
  removeEventListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ) => void;
};

export abstract class AutoHideBase {
  protected _enabled: boolean;

  private readonly _domListeners: DomListenerManager;
  private readonly _onEnable: () => void;
  private readonly _onDisable: () => void;

  protected constructor(options: LifecycleOptions = {}) {
    this._enabled = false;
    this._domListeners = createDomListenerManager() as unknown as DomListenerManager;
    this._onEnable = options.onEnable || (() => {});
    this._onDisable = options.onDisable || (() => {});
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  protected activate(setup: () => void): boolean {
    if (this._enabled) {
      return false;
    }

    setup();
    this._enabled = true;
    this._onEnable();
    return true;
  }

  protected deactivate(teardown?: () => void): boolean {
    if (!this._enabled) {
      return false;
    }

    teardown?.();
    this._domListeners.removeAll();
    this._enabled = false;
    this._onDisable();
    return true;
  }

  protected addListener(
    target: ListenerTarget,
    event: string,
    handler: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this._domListeners.add(target, event, handler, options);
  }
}

export function runRafThrottled(
  state: RafThrottleState,
  callback: () => void
): void {
  if (state._mouseMoveFramePending) {
    return;
  }

  state._mouseMoveFramePending = true;
  state._rafId = requestAnimationFrame(() => {
    state._mouseMoveFramePending = false;
    state._rafId = null;
    callback();
  });
}

export function cancelRafThrottled(state: RafThrottleState): void {
  if (state._rafId !== null) {
    cancelAnimationFrame(state._rafId);
    state._rafId = null;
  }
  state._mouseMoveFramePending = false;
}
