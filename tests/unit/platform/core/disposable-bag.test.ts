import { describe, expect, it, vi } from 'vitest';
import { DisposableBag } from '@platform/core';
import { createDeferred } from '../../../support/deferred.testkit';

describe('DisposableBag asynchronous cleanup', () => {
  it('joins repeated calls to a returned disposer and retains its rejection', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    const cleanup = vi.fn(() => pending.promise);
    const release = bag.add(cleanup);
    const first = release();
    const second = release();
    expect(second).toBe(first);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(bag.size).toBe(0);

    const failure = new Error('cleanup failed');
    const rejected = expect(second).rejects.toBe(failure);
    pending.reject(failure);
    await rejected;
    await expect(release()).rejects.toBe(failure);
  });

  it('concurrent clears both wait for an asynchronous resource and report its failure', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    const cleanup = vi.fn(() => pending.promise);
    bag.add(cleanup);
    const first = bag.clear();
    const second = bag.clear();
    let settled = false;
    void second.then(() => { settled = true; }, () => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(cleanup).toHaveBeenCalledTimes(1);

    const failure = new Error('resource failed');
    const rejected = Promise.all([
      expect(first).rejects.toBe(failure),
      expect(second).rejects.toBe(failure)
    ]);
    pending.reject(failure);
    await rejected;
  });

  it('clear joins cleanup already started by a keyed cancellation', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    bag.replace('resource', () => pending.promise);
    const cancelled = bag.cancel('resource');
    const cleared = bag.clear();
    let settled = false;
    void cleared.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve();
    await Promise.all([cancelled, cleared]);
    expect(settled).toBe(true);
  });

  it('keeps a remounted generation owned while the previous generation drains', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    bag.add(() => pending.promise);
    const firstClear = bag.clear();
    const newResource = vi.fn();
    bag.add(newResource);
    expect(bag.size).toBe(1);
    expect(newResource).not.toHaveBeenCalled();

    const secondClear = bag.clear();
    expect(newResource).toHaveBeenCalledTimes(1);
    let settled = false;
    void secondClear.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve();
    await Promise.all([firstClear, secondClear]);

    const restartedResource = vi.fn();
    bag.add(restartedResource);
    await bag.clear();
    expect(restartedResource).toHaveBeenCalledTimes(1);
  });

  it('starts all cleanup synchronously in reverse order and aggregates failures after draining', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    const syncFailure = new Error('synchronous failure');
    const asyncFailure = new Error('asynchronous failure');
    const order: string[] = [];
    bag.add(() => { order.push('first'); throw syncFailure; });
    bag.add(() => { order.push('second'); return pending.promise; });
    bag.add({ dispose() { order.push('third'); } });

    const cleared = bag.clear();
    const concurrentClear = bag.clear();
    expect(order).toEqual(['third', 'second', 'first']);
    const rejected = Promise.all([cleared, concurrentClear].map(async (result) => {
      await expect(result).rejects.toMatchObject({ errors: expect.arrayContaining([syncFailure, asyncFailure]) });
      await expect(result).rejects.toHaveProperty('errors.length', 2);
    }));
    pending.reject(asyncFailure);
    await rejected;
  });

  it('does not invoke individually tracked group members twice during clear', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    const cleanup = vi.fn(() => pending.promise);
    const release = bag.add(cleanup);
    bag.replaceGroup('group', [release]);
    const cleared = bag.clear();
    expect(cleanup).toHaveBeenCalledTimes(1);
    pending.resolve();
    await cleared;
  });

  it('reports each underlying failure once when concurrent clears join tracked groups', async () => {
    const bag = new DisposableBag();
    const pending = [createDeferred(), createDeferred()];
    const releases = pending.map((entry) => bag.add(() => entry.promise));
    bag.replaceGroup('group', releases);
    const cleared = [bag.clear(), bag.clear()];
    const failures = [new Error('first child'), new Error('second child')];
    const rejected = Promise.all(cleared.map(async (result) => {
      await expect(result).rejects.toMatchObject({ errors: expect.arrayContaining(failures) });
      await expect(result).rejects.toHaveProperty('errors.length', 2);
    }));
    pending[0]!.reject(failures[0]);
    pending[1]!.reject(failures[1]);
    await rejected;
  });

  it('preserves an owner-supplied aggregate error and its context', async () => {
    const bag = new DisposableBag();
    const pending = createDeferred();
    bag.add(() => pending.promise);
    const failure = new AggregateError([new Error('inner')], 'custom owner failure');
    const rejected = Promise.all([bag.clear(), bag.clear()].map((result) =>
      expect(result).rejects.toBe(failure)
    ));
    pending.reject(failure);
    await rejected;
  });
});
