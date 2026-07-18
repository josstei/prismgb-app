import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManagedLifecycleHost } from '../../../../src/platform/core/primitives/managed-lifecycle-host.js';

describe('ManagedLifecycleHost', () => {
  let host: ManagedLifecycleHost;

  beforeEach(() => {
    vi.useFakeTimers();
    host = new ManagedLifecycleHost();
  });

  afterEach(async () => {
    await host.dispose();
    vi.useRealTimers();
  });

  describe('timeout', () => {
    it('fires after the delay and passes arguments through', () => {
      const handler = vi.fn();
      host.timeout(handler, 100, 'payload');
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledWith('payload');
    });

    it('is cancelled by the returned disposer', () => {
      const handler = vi.fn();
      const dispose = host.timeout(handler, 100);
      dispose();
      vi.advanceTimersByTime(100);
      expect(handler).not.toHaveBeenCalled();
    });

    it('releases its bag entry after firing', () => {
      host.timeout(vi.fn(), 100);
      vi.advanceTimersByTime(100);
      expect(host.disposables.size).toBe(0);
    });
  });

  describe('interval', () => {
    it('fires repeatedly and stops on dispose', async () => {
      const handler = vi.fn();
      host.interval(handler, 50);
      vi.advanceTimersByTime(150);
      expect(handler).toHaveBeenCalledTimes(3);
      await host.dispose();
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('schedule', () => {
    it('replaces a pending timer registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      host.schedule('key', first, 100);
      host.schedule('key', second, 100);
      vi.advanceTimersByTime(100);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('cancelScheduled cancels a pending keyed timer', () => {
      const handler = vi.fn();
      host.schedule('key', handler, 100);
      host.cancelScheduled('key');
      vi.advanceTimersByTime(100);
      expect(handler).not.toHaveBeenCalled();
    });

    it('self-releases the key after firing so late cancels are no-ops', () => {
      const handler = vi.fn();
      host.schedule('key', handler, 100);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(() => host.cancelScheduled('key')).not.toThrow();
      expect(host.disposables.size).toBe(0);
    });
  });

  describe('scheduleInterval', () => {
    it('replaces a running interval registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      host.scheduleInterval('key', first, 50);
      host.scheduleInterval('key', second, 50);
      vi.advanceTimersByTime(100);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(2);
    });
  });

  describe('replaceManagedGroup', () => {
    it('disposes group members in reverse registration order', () => {
      const order: string[] = [];
      host.replaceManagedGroup('group', [
        () => { order.push('first'); },
        () => { order.push('second'); }
      ]);
      host.cancelManaged('group');
      expect(order).toEqual(['second', 'first']);
    });

    it('replaces a previously registered group under the same key', () => {
      const stale = vi.fn();
      const fresh = vi.fn();
      host.replaceManagedGroup('group', [stale]);
      host.replaceManagedGroup('group', [fresh]);
      expect(stale).toHaveBeenCalledTimes(1);
      host.cancelManaged('group');
      expect(fresh).toHaveBeenCalledTimes(1);
    });

    it('supports async members and settles the disposal promise', async () => {
      const settled = vi.fn();
      host.replaceManagedGroup('group', [async () => { settled(); }]);
      await host.cancelManaged('group');
      expect(settled).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeEvent', () => {
    it('registers and removes the listener through disposal', () => {
      const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
      const listener = vi.fn();
      const dispose = host.subscribeEvent(target, 'change', listener);
      expect(target.addEventListener).toHaveBeenCalledWith('change', listener, undefined);
      dispose();
      expect(target.removeEventListener).toHaveBeenCalledWith('change', listener, undefined);
    });
  });

  describe('observe', () => {
    it('disconnects the observer on disposal', async () => {
      const observer = { disconnect: vi.fn() };
      host.observe(observer);
      await host.dispose();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('clears tracked and keyed disposables', async () => {
      const tracked = vi.fn();
      const keyed = vi.fn();
      host.track(tracked);
      host.replaceManaged('key', keyed);
      await host.dispose();
      expect(tracked).toHaveBeenCalledTimes(1);
      expect(keyed).toHaveBeenCalledTimes(1);
    });
  });
});
