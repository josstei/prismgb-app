import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { bindText, bindProperty } from '@renderer/presentation/primitives/signal-bindings.utils';
import type { StatusNotificationStore } from '@renderer/presentation/shell/status-notification.store';

export interface StatusNotificationElements {
  statusMessage?: HTMLElement | null;
}

export interface StatusNotificationComponentOptions {
  elements: StatusNotificationElements;
  store: StatusNotificationStore;
}

export class StatusNotificationComponent extends PresentationComponent {
  constructor({ elements, store }: StatusNotificationComponentOptions) {
    super();
    this.disposables.add(store);

    const statusMessage = elements.statusMessage ?? null;
    this.disposables.add(bindText(statusMessage, store.message));
    this.disposables.add(bindProperty(statusMessage?.dataset ?? null, 'type', store.type));
  }
}
