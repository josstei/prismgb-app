import { signal, type ReadonlySignal } from '@platform/ui-base/reactive';
import { EventChannels, type EventPayloadMap, type TypedEventBusLike } from '@platform/events';
import { ReactiveStore } from './reactive-store.base.js';

const VALID_TYPES = ['info', 'success', 'warning', 'error'] as const;
export type StatusNotificationType = (typeof VALID_TYPES)[number];

export interface StatusNotificationStoreDependencies {
  eventBus: Pick<TypedEventBusLike, 'subscribe'>;
}

/** Owns status-message reactive state; subscribes the bus → signal (event→state). */
export class StatusNotificationStore extends ReactiveStore {
  private readonly _message = signal('');
  private readonly _type = signal<StatusNotificationType>('info');

  constructor(private readonly dependencies: StatusNotificationStoreDependencies) {
    super();

    this.track(this.dependencies.eventBus.subscribe(
      EventChannels.UI.STATUS_MESSAGE,
      (payload) => this.apply(payload)
    ));
  }

  get message(): ReadonlySignal<string> {
    return this._message;
  }

  get type(): ReadonlySignal<StatusNotificationType> {
    return this._type;
  }

  private apply(payload: EventPayloadMap[typeof EventChannels.UI.STATUS_MESSAGE]): void {
    this._message.value = typeof payload?.message === 'string' ? payload.message : '';
    this._type.value = VALID_TYPES.includes(payload?.type as StatusNotificationType)
      ? (payload?.type as StatusNotificationType)
      : 'info';
  }
}
