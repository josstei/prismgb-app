import { describe, it, expect, beforeEach } from 'vitest';
import { StatusNotificationComponent } from '@renderer/presentation/shell/status-notification.component';
import { StatusNotificationStore } from '@renderer/presentation/shell/status-notification.store';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { EventBus } from '@renderer/lib/events/event-bus';

describe('StatusNotificationComponent (signal bindings)', () => {
  let el: HTMLElement;
  let bus: EventBus;
  let store: StatusNotificationStore;

  beforeEach(() => {
    el = document.createElement('div');
    bus = new EventBus();
    store = new StatusNotificationStore({ eventBus: bus });
    new StatusNotificationComponent({ elements: { statusMessage: el }, store });
  });

  it('renders message + type from a published event', () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Saved', type: 'success' });
    expect(el.textContent).toBe('Saved');
    expect(el.dataset.type).toBe('success');
  });

  it('falls back to info for unknown type', () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'X', type: 'nope' });
    expect(el.dataset.type).toBe('info');
  });
});
