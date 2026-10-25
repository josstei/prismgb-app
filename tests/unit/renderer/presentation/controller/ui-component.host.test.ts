import { describe, it, expect, vi } from 'vitest';
import { UiComponentHost } from '@renderer/presentation/controller/ui-component.host.js';

describe('UiComponentHost', () => {
  it('constructs only core components until a deferred component is accessed', () => {
    const core = vi.fn(() => ({ dispose: vi.fn() }));
    const deferred = vi.fn(() => ({ dispose: vi.fn() }));
    const host = new UiComponentHost({
      core: { deferred: false, create: core },
      deferred: { deferred: true, create: deferred }
    });
    expect(core).not.toHaveBeenCalled();
    host.touchCore();
    expect(core).toHaveBeenCalledOnce();
    expect(deferred).not.toHaveBeenCalled();
    host.touchDeferred();
    expect(host.get('deferred')).toBe(host.get('deferred'));
    host.touchDeferred();
    expect(deferred).toHaveBeenCalledOnce();
  });

  it('disposes only constructed components in reverse creation order and continues after failure', async () => {
    const order: string[] = [];
    const host = new UiComponentHost({
      first: { deferred: false, create: () => ({ dispose: () => { order.push('first'); } }) },
      second: { deferred: true, create: () => ({ dispose: () => { order.push('second'); throw new Error('failed'); } }) },
      unused: { deferred: true, create: () => ({ dispose: () => { order.push('unused'); } }) }
    });
    host.touchCore();
    host.get('second');
    const disposal = host.dispose();
    expect(host.dispose()).toBe(disposal);
    await expect(disposal).rejects.toThrow('UI component disposal failed');
    expect(order).toEqual(['second', 'first']);
    expect(() => host.get('first')).toThrow('UI component host has been disposed');
  });
});
