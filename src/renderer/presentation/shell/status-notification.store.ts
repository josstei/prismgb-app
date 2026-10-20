import { signal, type ReadonlySignal } from '@preact/signals-core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

const VALID_TYPES = ['info', 'success', 'warning', 'error'] as const;
type StatusNotificationType = (typeof VALID_TYPES)[number];

function isStatusNotificationType(type: string | undefined): type is StatusNotificationType {
  return VALID_TYPES.includes(type as StatusNotificationType);
}

export class StatusNotificationStore extends PresentationComponent {
  private readonly _message = signal('');
  private readonly _type = signal<StatusNotificationType>('info');

  constructor({ eventBus }: { eventBus: EventBus }) {
    super();

    this.disposables.add(eventBus.subscribe(EventChannels.UI.STATUS_MESSAGE, ({ message, type }) => {
      this._message.value = message;
      this._type.value = isStatusNotificationType(type) ? type : 'info';
    }));
  }

  get message(): ReadonlySignal<string> {
    return this._message;
  }

  get type(): ReadonlySignal<StatusNotificationType> {
    return this._type;
  }
}
