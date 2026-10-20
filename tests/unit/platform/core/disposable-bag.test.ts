import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DisposableBag } from '@platform/core';

describe('DisposableBag', () => {
  let bag: DisposableBag;

  beforeEach(() => {
    vi.useFakeTimers();
    bag = new DisposableBag();
  });

  afterEach(async () => {
    await bag.dispose();
    vi.useRealTimers();
  });

  describe('add', () => {
    it('accepts functions and dispose/unsubscribe/abort objects, ignoring empty values', async () => {
      const fn = vi.fn();
      const disposable = { dispose: vi.fn() };
      const subscription = { unsubscribe: vi.fn() };
      const controller = { abort: vi.fn() };

      bag.add(fn);
      bag.add(disposable);
      bag.add(subscription);
      bag.add(controller);
      bag.add(null);
      bag.add(undefined);
      expect(bag.size).toBe(4);

      await bag.dispose();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(controller.abort).toHaveBeenCalledTimes(1);
      expect(bag.size).toBe(0);
    });

    it('returns a release function that disposes once and untracks the entry', async () => {
      const fn = vi.fn();
      const release = bag.add(fn);

      release();
      release();
      await bag.dispose();

      expect(fn).toHaveBeenCalledTimes(1);
      expect(bag.size).toBe(0);
    });
  });

  describe('dispose', () => {
    it('disposes in reverse registration order', async () => {
      const order: string[] = [];
      bag.add(() => { order.push('first'); });
      bag.add(() => { order.push('second'); });

      await bag.dispose();

      expect(order).toEqual(['second', 'first']);
    });

    it('rethrows a single failure after running every disposer', async () => {
      const failure = new Error('boom');
      const after = vi.fn();
      bag.add(after);
      bag.add(() => { throw failure; });

      await expect(bag.dispose()).rejects.toBe(failure);
      expect(after).toHaveBeenCalledTimes(1);
    });

    it('aggregates multiple sync and async failures', async () => {
      bag.add(() => { throw new Error('sync'); });
      bag.add(() => Promise.reject(new Error('async')));

      const error = await bag.dispose().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).message).toBe('Multiple disposables failed during cleanup');
      expect((error as AggregateError).errors).toHaveLength(2);
    });

    it('waits for async disposers and stays usable afterwards', async () => {
      const settled = vi.fn();
      bag.add(async () => { settled(); });

      await bag.dispose();
      expect(settled).toHaveBeenCalledTimes(1);

      const next = vi.fn();
      bag.add(next);
      await bag.dispose();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('clears keyed entries', async () => {
      const keyed = vi.fn();
      bag.replace('key', keyed);

      await bag.dispose();
      bag.cancel('key');

      expect(keyed).toHaveBeenCalledTimes(1);
    });
  });

  describe('replace / cancel', () => {
    it('disposes the previous entry registered under the same key', () => {
      const stale = vi.fn();
      const fresh = vi.fn();

      bag.replace('key', stale);
      bag.replace('key', fresh);

      expect(stale).toHaveBeenCalledTimes(1);
      expect(fresh).not.toHaveBeenCalled();
      expect(bag.size).toBe(1);
    });

    it('cancel disposes the keyed entry and is a no-op afterwards', () => {
      const keyed = vi.fn();
      bag.replace('key', keyed);

      bag.cancel('key');
      bag.cancel('key');

      expect(keyed).toHaveBeenCalledTimes(1);
      expect(bag.size).toBe(0);
    });

    it('a stale release does not cancel a newer entry under the same key', () => {
      const fresh = vi.fn();
      const releaseStale = bag.replace('key', vi.fn<() => void>());
      bag.replace('key', fresh);

      releaseStale();
      bag.cancel('key');

      expect(fresh).toHaveBeenCalledTimes(1);
    });

    it('refuses to replace an entry whose cleanup is still pending', () => {
      bag.replace('key', () => Promise.resolve());

      expect(() => bag.replace('key', vi.fn<() => void>())).toThrow('DisposableBag.replace() cannot replace pending async cleanup');
    });
  });

  describe('replaceGroup', () => {
    it('disposes group members in reverse registration order', () => {
      const order: string[] = [];
      bag.replaceGroup('group', [
        () => { order.push('first'); },
        () => { order.push('second'); }
      ]);

      bag.cancel('group');

      expect(order).toEqual(['second', 'first']);
    });

    it('replaces a previously registered group under the same key', () => {
      const stale = vi.fn();
      const fresh = vi.fn();
      bag.replaceGroup('group', [stale]);
      bag.replaceGroup('group', [fresh]);

      expect(stale).toHaveBeenCalledTimes(1);
      bag.cancel('group');
      expect(fresh).toHaveBeenCalledTimes(1);
    });

    it('settles async members through the returned promise', async () => {
      const settled = vi.fn();
      bag.replaceGroup('group', [async () => { settled(); }]);

      await bag.cancel('group');

      expect(settled).toHaveBeenCalledTimes(1);
    });
  });

  describe('listen', () => {
    it('calls addEventListener and removeEventListener with exactly two arguments without options', () => {
      const target = new EventTarget();
      const add = vi.spyOn(target, 'addEventListener');
      const remove = vi.spyOn(target, 'removeEventListener');
      const listener = vi.fn();

      const release = bag.listen(target, 'change', listener);
      target.dispatchEvent(new Event('change'));
      release();
      target.dispatchEvent(new Event('change'));

      expect(add.mock.calls[0]).toEqual(['change', listener]);
      expect(add.mock.calls[0]).toHaveLength(2);
      expect(remove.mock.calls[0]).toHaveLength(2);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('forwards options to both add and remove', () => {
      const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as EventTarget;
      const listener = vi.fn();
      const options = { passive: true };

      bag.listen(target, 'scroll', listener, options)();

      expect(target.addEventListener).toHaveBeenCalledWith('scroll', listener, options);
      expect(target.removeEventListener).toHaveBeenCalledWith('scroll', listener, options);
    });

    it('returns a no-op for a missing target', () => {
      expect(() => bag.listen(null, 'change', () => {})()).not.toThrow();
      expect(bag.listen(undefined, 'change', () => {})).toBeTypeOf('function');
      expect(bag.size).toBe(0);
    });

    it('removes listeners on dispose', async () => {
      const target = new EventTarget();
      const listener = vi.fn();
      bag.listen(target, 'change', listener);

      await bag.dispose();
      target.dispatchEvent(new Event('change'));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('timeout', () => {
    it('fires after the delay and releases its entry', () => {
      const handler = vi.fn();
      bag.timeout(handler, 100);

      vi.advanceTimersByTime(99);
      expect(handler).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(bag.size).toBe(0);
    });

    it('is cancelled by the returned release and by dispose', async () => {
      const released = vi.fn();
      const disposed = vi.fn();
      bag.timeout(released, 100)();
      bag.timeout(disposed, 100);

      await bag.dispose();
      vi.advanceTimersByTime(100);

      expect(released).not.toHaveBeenCalled();
      expect(disposed).not.toHaveBeenCalled();
    });
  });

  describe('interval', () => {
    it('fires repeatedly until disposed', async () => {
      const handler = vi.fn();
      bag.interval(handler, 50);

      vi.advanceTimersByTime(150);
      expect(handler).toHaveBeenCalledTimes(3);

      await bag.dispose();
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('schedule', () => {
    it('replaces a pending timer registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      bag.schedule('key', first, 100);
      bag.schedule('key', second, 100);

      vi.advanceTimersByTime(100);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('is cancelled through cancel(key)', () => {
      const handler = vi.fn();
      bag.schedule('key', handler, 100);

      bag.cancel('key');
      vi.advanceTimersByTime(100);

      expect(handler).not.toHaveBeenCalled();
    });

    it('self-releases the key after firing so late cancels are no-ops', () => {
      const handler = vi.fn();
      bag.schedule('key', handler, 100);

      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(() => bag.cancel('key')).not.toThrow();
      expect(bag.size).toBe(0);
    });
  });

  describe('scheduleInterval', () => {
    it('replaces a running interval registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      bag.scheduleInterval('key', first, 50);
      bag.scheduleInterval('key', second, 50);

      vi.advanceTimersByTime(100);

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(2);
    });

    it('stops through cancel(key)', () => {
      const handler = vi.fn();
      bag.scheduleInterval('poll', handler, 50);
      vi.advanceTimersByTime(100);

      bag.cancel('poll');
      vi.advanceTimersByTime(100);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('scheduleFrame', () => {
    it('runs the latest frame callback for a key and self-releases', () => {
      const first = vi.fn();
      const second = vi.fn();
      bag.scheduleFrame('frame', first);
      bag.scheduleFrame('frame', second);

      vi.advanceTimersToNextFrame();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
      expect(bag.size).toBe(0);
    });
  });
});
