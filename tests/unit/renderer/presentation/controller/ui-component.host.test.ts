import { describe, it, expect, vi } from 'vitest';
import { UiComponentHost } from '@renderer/presentation/controller/ui-component.host.js';

describe('UiComponentHost', () => {
  it('constructs only core components until a deferred component is accessed', () => {
    const core = vi.fn(() => ({ dispose: vi.fn() }));
    const deferred = vi.fn(() => ({ dispose: vi.fn() }));
    const host = new UiComponentHost({ core, deferred }, ['core']);
    expect(core).not.toHaveBeenCalled();
    host.touchCore();
    expect(core).toHaveBeenCalledOnce();
    expect(deferred).not.toHaveBeenCalled();
    expect(host.get('deferred')).toBe(host.get('deferred'));
    expect(deferred).toHaveBeenCalledOnce();
  });

  it('disposes only constructed components in reverse creation order and continues after failure', async () => {
    const order: string[] = [];
    const host = new UiComponentHost({
      first: () => ({ dispose: () => { order.push('first'); } }),
      second: () => ({ dispose: () => { order.push('second'); throw new Error('failed'); } }),
      unused: () => ({ dispose: () => { order.push('unused'); } })
    }, ['first']);
    host.touchCore();
    host.get('second');
    const disposal = host.dispose();
    expect(host.dispose()).toBe(disposal);
    await expect(disposal).rejects.toThrow('UI component disposal failed');
    expect(order).toEqual(['second', 'first']);
    expect(() => host.get('first')).toThrow('UI component host has been disposed');
  });
});
