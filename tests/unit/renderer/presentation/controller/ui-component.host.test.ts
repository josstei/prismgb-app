// @ts-nocheck
/**
 * UiComponentHost Unit Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { UiComponentHost } from '@renderer/presentation/controller/ui-component.host.js';
import { createLoggerFactory } from '../../../../factories/index.js';

describe('UiComponentHost', () => {
  function createHost({ resolve, coreTokens = {}, allTokens, loggerFactory } = {}) {
    return new UiComponentHost(
      resolve ?? vi.fn((token) => ({ token })),
      coreTokens,
      allTokens ?? coreTokens,
      loggerFactory
    );
  }

  it('does not resolve a component until it is accessed', () => {
    const resolve = vi.fn(() => ({}));
    const host = createHost({ resolve, allTokens: { a: 'tokenA' } });

    expect(resolve).not.toHaveBeenCalled();

    host.get('a');

    expect(resolve).toHaveBeenCalledWith('tokenA');
  });

  it('caches the resolved instance across repeated access', () => {
    const instance = {};
    const resolve = vi.fn(() => instance);
    const host = createHost({ resolve, allTokens: { a: 'tokenA' } });

    const first = host.get('a');
    const second = host.get('a');

    expect(first).toBe(instance);
    expect(second).toBe(instance);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('touchCore resolves exactly the core ids', () => {
    const resolve = vi.fn((token) => ({ token }));
    const host = createHost({
      resolve,
      coreTokens: { a: 'tokenA', b: 'tokenB' },
      allTokens: { a: 'tokenA', b: 'tokenB', c: 'tokenC' }
    });

    host.touchCore();

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenCalledWith('tokenA');
    expect(resolve).toHaveBeenCalledWith('tokenB');
    expect(resolve).not.toHaveBeenCalledWith('tokenC');
  });

  it('resolvedIds reflects touch order', () => {
    const resolve = vi.fn((token) => ({ token }));
    const host = createHost({ resolve, allTokens: { a: 'tokenA', b: 'tokenB', c: 'tokenC' } });

    host.get('b');
    host.get('a');
    host.get('c');

    expect(host.resolvedIds()).toEqual(['b', 'a', 'c']);
  });

  it('disposes resolved components in reverse resolution order', async () => {
    const disposeOrder = [];
    const componentA = { dispose: vi.fn(() => disposeOrder.push('a')) };
    const componentB = { dispose: vi.fn(() => disposeOrder.push('b')) };
    const resolve = vi.fn((token) => (token === 'tokenA' ? componentA : componentB));
    const host = createHost({ resolve, allTokens: { a: 'tokenA', b: 'tokenB' } });

    host.get('a');
    host.get('b');
    await host.dispose();

    expect(disposeOrder).toEqual(['b', 'a']);
  });

  it('isolates dispose errors so remaining components still dispose', async () => {
    const loggerFactory = createLoggerFactory();
    const logger = loggerFactory.create('UiComponentHost');
    const componentA = { dispose: vi.fn() };
    const componentB = { dispose: vi.fn(() => { throw new Error('boom'); }) };
    const resolve = vi.fn((token) => (token === 'tokenA' ? componentA : componentB));
    const host = createHost({ resolve, allTokens: { a: 'tokenA', b: 'tokenB' }, loggerFactory });

    host.get('a');
    host.get('b');

    await expect(host.dispose()).resolves.not.toThrow();
    expect(componentA.dispose).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('clears resolved state after dispose', async () => {
    const resolve = vi.fn(() => ({ dispose: vi.fn() }));
    const host = createHost({ resolve, allTokens: { a: 'tokenA' } });

    host.get('a');
    await host.dispose();

    expect(host.resolvedIds()).toEqual([]);
  });
});
