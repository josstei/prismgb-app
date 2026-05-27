import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';

type StatusMessageElementLike = {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
};

const STATUS_NOTIFICATION_TYPES = ['info', 'success', 'warning', 'error'] as const;

export interface StatusNotificationElements {
  statusMessage?: StatusMessageElementLike | null;
}

class StatusNotificationComponent extends PresentationComponent {
  declare elements: StatusNotificationElements;
  readonly validTypes: readonly string[] = STATUS_NOTIFICATION_TYPES;

  constructor(elements: StatusNotificationElements) {
    super();
    this.elements = elements;
  }

  show(message: string, type = 'info'): void {
    if (!this.elements.statusMessage) return;
    this.elements.statusMessage.textContent = message;
    const validType = this.validTypes.includes(type) ? type : 'info';
    this.elements.statusMessage.dataset.type = validType;
  }
}

export { StatusNotificationComponent };
