import { describe, it, expect, vi } from 'vitest';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';

describe('createTrpcEventBridge', () => {
  it('owns every subscription it starts', () => {
    const unsubscribeA = vi.fn();
    const unsubscribeB = vi.fn();
    const startA = vi.fn(() => ({ unsubscribe: unsubscribeA }));
    const startB = vi.fn(() => ({ unsubscribe: unsubscribeB }));

    const bridge = createTrpcEventBridge('Test', [startA, startB]);

    expect(startA).toHaveBeenCalledOnce();
    expect(startB).toHaveBeenCalledOnce();
    bridge.dispose();
    expect(unsubscribeA).toHaveBeenCalledOnce();
    expect(unsubscribeB).toHaveBeenCalledOnce();
  });

  it('disposes handles in reverse order and is idempotent', () => {
    const order: string[] = [];
    const start = (id: string) => () => ({ unsubscribe: () => { order.push(id); } });

    const bridge = createTrpcEventBridge('Test', [start('a'), start('b'), start('c')]);
    bridge.dispose();
    bridge.dispose();

    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('isolates an unsubscribe error and continues, logging via the provided logger', () => {
    const logger = { error: vi.fn() };
    const ok = vi.fn();

    const bridge = createTrpcEventBridge('Test', [
      () => ({ unsubscribe: () => { throw new Error('boom'); } }),
      () => ({ unsubscribe: ok })
    ], logger);
    bridge.dispose();

    expect(ok).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('tears down already-started subscriptions when a later starter throws', () => {
    const unsubscribe = vi.fn();
    const start = vi.fn(() => ({ unsubscribe }));
    const throwing = vi.fn(() => { throw new Error('start failed'); });

    expect(() => createTrpcEventBridge('Test', [start, throwing])).toThrow('start failed');
    expect(unsubscribe).toHaveBeenCalled();
  });
});
