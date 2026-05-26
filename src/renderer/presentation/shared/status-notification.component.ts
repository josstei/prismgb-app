type StatusMessageElementLike = {
  textContent: string | null;
  dataset: Record<string, string | undefined>;
};

export interface StatusNotificationElements {
  statusMessage?: StatusMessageElementLike | null;
}

class StatusNotificationComponent {
  declare elements: StatusNotificationElements;
  declare validTypes: string[];

  constructor(elements: StatusNotificationElements) {
    this.elements = elements;
    this.validTypes = ['info', 'success', 'warning', 'error'];
  }

  show(message: string, type = 'info'): void {
    if (!this.elements.statusMessage) return;
    this.elements.statusMessage.textContent = message;
    const validType = this.validTypes.includes(type) ? type : 'info';
    this.elements.statusMessage.dataset.type = validType;
  }
}

export { StatusNotificationComponent };
