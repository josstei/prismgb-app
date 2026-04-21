import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../../src/events/event-bus';

interface TestMap {
  'ping': { ts: number };
  'pong': void;
  'data': { value: string };
}

describe('EventBus<TMap>', () => {
  it('publish delivers payload to subscribers', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    bus.subscribe('ping', handler);
    bus.publish('ping', { ts: 1 });
    expect(handler).toHaveBeenCalledWith({ ts: 1 });
  });

  it('subscribe returns an unsubscribe function', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    const unsubscribe = bus.subscribe('ping', handler);
    bus.publish('ping', { ts: 1 });
    unsubscribe();
    bus.publish('ping', { ts: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('multiple handlers on same channel all fire', () => {
    const bus = new EventBus<TestMap>();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('ping', a);
    bus.subscribe('ping', b);
    bus.publish('ping', { ts: 1 });
    expect(a).toHaveBeenCalledWith({ ts: 1 });
    expect(b).toHaveBeenCalledWith({ ts: 1 });
  });

  it('handlers on different channels are isolated', () => {
    const bus = new EventBus<TestMap>();
    const ping = vi.fn();
    const pong = vi.fn();
    bus.subscribe('ping', ping);
    bus.subscribe('pong', pong);
    bus.publish('ping', { ts: 1 });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(pong).not.toHaveBeenCalled();
  });

  it('void payload channels can be published with undefined', () => {
    const bus = new EventBus<TestMap>();
    const handler = vi.fn();
    bus.subscribe('pong', handler);
    bus.publish('pong', undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
