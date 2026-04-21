import { describe, it, expect, vi } from 'vitest';
import { Channel } from '../../../src/events/channel';

describe('Channel<T>', () => {
  it('delivers next() values to subscribers', () => {
    const channel = new Channel<string>();
    const handler = vi.fn();
    channel.subscribe(handler);
    channel.next('hello');
    expect(handler).toHaveBeenCalledWith('hello');
  });

  it('delivers values to multiple subscribers', () => {
    const channel = new Channel<number>();
    const a = vi.fn();
    const b = vi.fn();
    channel.subscribe(a);
    channel.subscribe(b);
    channel.next(42);
    expect(a).toHaveBeenCalledWith(42);
    expect(b).toHaveBeenCalledWith(42);
  });

  it('unsubscribe stops receiving values', () => {
    const channel = new Channel<number>();
    const handler = vi.fn();
    const sub = channel.subscribe(handler);
    channel.next(1);
    sub.unsubscribe();
    channel.next(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('complete() stops future deliveries', () => {
    const channel = new Channel<number>();
    const handler = vi.fn();
    channel.subscribe(handler);
    channel.next(1);
    channel.complete();
    channel.next(2);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
