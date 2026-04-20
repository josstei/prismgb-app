import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { Subscribe } from '../../../src/decorators/subscribe';
import { getSubscribeHandlers } from '../../../src/metadata/subscribe-metadata';

describe('@Subscribe decorator', () => {
  it('registers a method as a channel handler', () => {
    class Foo {
      @Subscribe('test:event')
      onTestEvent() {}
    }
    const handlers = getSubscribeHandlers(Foo);
    expect(handlers).toHaveLength(1);
    expect(handlers[0].channel).toBe('test:event');
    expect(handlers[0].methodName).toBe('onTestEvent');
  });

  it('supports multiple subscriptions on same class', () => {
    class Foo {
      @Subscribe('stream:started')
      onStart() {}
      @Subscribe('stream:stopped')
      onStop() {}
    }
    const handlers = getSubscribeHandlers(Foo);
    expect(handlers).toHaveLength(2);
    const channels = handlers.map(h => h.channel).sort();
    expect(channels).toEqual(['stream:started', 'stream:stopped']);
  });

  it('returns empty array for class with no @Subscribe methods', () => {
    class Plain {}
    expect(getSubscribeHandlers(Plain)).toEqual([]);
  });
});
