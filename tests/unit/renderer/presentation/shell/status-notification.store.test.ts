import { describe, it, expect, beforeEach } from 'vitest';
import { StatusNotificationStore } from '@renderer/presentation/shell/status-notification.store';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { EventBus } from '@renderer/lib/events/event-bus';

describe('StatusNotificationStore', () => {
  let bus: EventBus;
  let store: StatusNotificationStore;

  beforeEach(() => {
    bus = new EventBus();
    store = new StatusNotificationStore({ eventBus: bus });
  });

  it('updates message and type when UI.STATUS_MESSAGE is published', () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'hello', type: 'warning' });
    expect(store.message.value).toBe('hello');
    expect(store.type.value).toBe('warning');
  });

  it('falls back to type info for invalid types', () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'hello', type: 'invalid' });
    expect(store.message.value).toBe('hello');
    expect(store.type.value).toBe('info');
  });

  it('unsubscribes and stops updating on dispose', () => {
    store.dispose();
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'ignored', type: 'error' });
    expect(store.message.value).toBe('');
    expect(store.type.value).toBe('info');
  });
});
