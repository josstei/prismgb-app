import { describe, it, expect, vi } from 'vitest';
import { BufferedChannel } from '../../../src/events/buffered-channel';

describe('BufferedChannel<T>', () => {
  it('delivers values to late subscribers from buffer', () => {
    const channel = new BufferedChannel<number>(10);
    channel.next(1);
    channel.next(2);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    expect(received).toEqual([1, 2]);
  });

  it('caps buffer at maxBufferSize', () => {
    const channel = new BufferedChannel<number>(3);
    channel.next(1);
    channel.next(2);
    channel.next(3);
    channel.next(4);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    expect(received).toEqual([2, 3, 4]);
  });

  it('delivers both buffered and new values', () => {
    const channel = new BufferedChannel<number>(10);
    channel.next(1);
    const received: number[] = [];
    channel.subscribe((v) => received.push(v));
    channel.next(2);
    channel.next(3);
    expect(received).toEqual([1, 2, 3]);
  });

  it('throws on zero or negative maxBufferSize', () => {
    expect(() => new BufferedChannel(0)).toThrow(/maxBufferSize must be >= 1/);
    expect(() => new BufferedChannel(-1)).toThrow(/maxBufferSize must be >= 1/);
  });
});
