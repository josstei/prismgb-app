import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
import { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';
import { PlatformEventBus, EventChannels } from '@platform/events';

describe('Status notification event → state → DOM', () => {
  let element: HTMLElement;
  let bus: PlatformEventBus;
  let store: StatusNotificationStore;
  let component: StatusNotificationComponent;

  beforeEach(() => {
    element = document.createElement('div');
    bus = new PlatformEventBus();
    store = new StatusNotificationStore({ eventBus: bus });
    component = new StatusNotificationComponent({ elements: { statusMessage: element }, store });
  });

  afterEach(async () => { await component.dispose(); });

  it('renders the default state and a published message/type', () => {
    expect(element.textContent).toBe('');
    expect(element.dataset.type).toBe('info');
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Saved', type: 'success' });
    expect(store.message.value).toBe('Saved');
    expect(store.type.value).toBe('success');
    expect(element.textContent).toBe('Saved');
    expect(element.dataset.type).toBe('success');
  });

  it('falls back to info for unknown message types', () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'hello', type: 'invalid' });
    expect(store.message.value).toBe('hello');
    expect(store.type.value).toBe('info');
    expect(element.textContent).toBe('hello');
    expect(element.dataset.type).toBe('info');
  });

  it('disposes its store subscription and DOM bindings together', async () => {
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Saved', type: 'success' });
    await component.dispose();
    bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'ignored', type: 'error' });
    expect(store.message.value).toBe('Saved');
    expect(store.type.value).toBe('success');
    expect(element.textContent).toBe('Saved');
    expect(element.dataset.type).toBe('success');
    expect(bus.emitter.listenerCount(EventChannels.UI.STATUS_MESSAGE)).toBe(0);
  });
});
