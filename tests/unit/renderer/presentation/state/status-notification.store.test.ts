import { describe, it, expect, beforeEach } from 'vitest';
import { StatusNotificationStore } from '../../../../../src/renderer/presentation/state/status-notification.store.js';
import { SharedEventBus, EventChannels } from '@platform/events';

describe('StatusNotificationStore', () => {
  let bus: SharedEventBus;
  let store: StatusNotificationStore;

  beforeEach(() => {
    bus = new SharedEventBus();
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
