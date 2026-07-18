import { PresentationComponent } from '@platform/ui-base';
import { bindText, bindProperty } from '@platform/ui-base/reactive';
import type { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';

interface StatusMessageElementLike {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
}
export interface StatusNotificationElements {
  statusMessage?: StatusMessageElementLike | null;
}

export interface StatusNotificationComponentOptions {
  elements: StatusNotificationElements;
  store: StatusNotificationStore;
}

class StatusNotificationComponent extends PresentationComponent {
  constructor({ elements, store }: StatusNotificationComponentOptions) {
    super();
    this.track(store); // DisposableBag accepts an object with dispose(); releases the bus subscription
    const el = elements.statusMessage ?? null;
    this.track(bindText(el, store.message));
    this.track(bindProperty(el?.dataset ?? null, 'type', store.type));
  }
}
export { StatusNotificationComponent };
