import { describe, it, expect, vi } from 'vitest';
import { createApplicationLifecycle, disposeInOrder } from '@platform/core';

describe('application lifecycle', () => {
  it('shares pending initialization and waits for it before disposing exactly once', async () => {
    let ready!: () => void;
    const initialize = vi.fn(() => new Promise<void>((resolve) => { ready = resolve; }));
    const dispose = vi.fn();
    const runtime = createApplicationLifecycle(initialize, dispose);
    const first = runtime.initialize();
    expect(runtime.initialize()).toBe(first);
    await Promise.resolve();
    const closing = runtime.dispose();
    expect(runtime.dispose()).toBe(closing);
    expect(dispose).not.toHaveBeenCalled();
    ready();
    await Promise.all([first, closing]);
    expect(dispose).toHaveBeenCalledOnce();
    await expect(runtime.initialize()).rejects.toThrow('disposed');
  });

  it('rolls back initialization failure and preserves the original error if disposal also fails', async () => {
    const failure = new Error('startup');
    const dispose = vi.fn(() => { throw new Error('cleanup'); });
    const runtime = createApplicationLifecycle(() => { throw failure; }, dispose);
    await expect(runtime.initialize()).rejects.toBe(failure);
    await expect(runtime.dispose()).rejects.toThrow('cleanup');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('runs every disposer in dependency order even after failure', async () => {
    const order: string[] = [];
    await expect(disposeInOrder([
      async () => { order.push('capture'); throw new Error('stop capture'); },
      async () => { order.push('render'); },
      () => { order.push('ui'); }
    ])).rejects.toThrow('Runtime disposal failed');
    expect(order).toEqual(['capture', 'render', 'ui']);
  });
});
