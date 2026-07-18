import { describe, it, expect, beforeEach } from 'vitest';
import { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
import { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';
import { PlatformEventBus, EventChannels } from '@platform/events';

describe('StatusNotificationComponent (signal bindings)', () => {
  let el: HTMLElement;
  let bus: PlatformEventBus;
  let store: StatusNotificationStore;

  beforeEach(() => {
    el = document.createElement('div');
    bus = new PlatformEventBus();
    store = new StatusNotificationStore({ eventBus: bus });
    new StatusNotificationComponent({ elements: { statusMessage: el as any }, store });
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
