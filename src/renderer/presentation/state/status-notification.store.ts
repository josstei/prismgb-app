import { signal, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels } from '@platform/events';
import type { EventBusLike } from '@platform/core';
import { ReactiveStore } from './reactive-store.base.js';

const VALID_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type StatusNotificationType = (typeof VALID_TYPES)[number];

export interface StatusNotificationStoreDependencies {
  eventBus: EventBusLike;
}

/** Owns status-message reactive state; subscribes the bus → signal (event→state). */
export class StatusNotificationStore extends ReactiveStore {
  private readonly _message = signal('');
  private readonly _type = signal<StatusNotificationType>('info');

  constructor(private readonly dependencies: StatusNotificationStoreDependencies) {
    super();

    this.track(this.dependencies.eventBus.subscribe(
      EventChannels.UI.STATUS_MESSAGE,
      (...args: unknown[]) => this.apply(args[0])
    ));
  }

  get message(): ReadonlySignal<string> {
    return this._message;
  }

  get type(): ReadonlySignal<StatusNotificationType> {
    return this._type;
  }

  private apply(payload: unknown): void {
    const data =
      typeof payload === 'object' && payload !== null
        ? (payload as { message?: unknown; type?: unknown })
        : {};
    this._message.value = typeof data.message === 'string' ? data.message : '';
    this._type.value = VALID_TYPES.includes(data.type as StatusNotificationType)
      ? (data.type as StatusNotificationType)
      : 'info';
  }
}
