import { describe, it, expect, vi } from 'vitest';
import { Container } from '@prismgb/core';

interface TestTokenMap {
  config: { name: string };
  logger: { error: (...args: unknown[]) => void };
  serviceA: ServiceA;
  serviceB: ServiceB;
  preBuilt: { id: string };
}

class ServiceA {
  readonly config: { name: string };
  disposed = 0;
  constructor(cradle: TestTokenMap) {
    this.config = cradle.config;
  }
  dispose(): void {
    this.disposed += 1;
  }
}

class ServiceB {
  readonly serviceA: ServiceA;
  cleaned = 0;
  constructor(cradle: TestTokenMap) {
    this.serviceA = cradle.serviceA;
  }
  cleanup(): void {
    this.cleaned += 1;
  }
}

function buildContainer(): Container<TestTokenMap> {
  const container = new Container<TestTokenMap>();
  container.register('config', () => ({ name: 'prismgb' }));
  container.register('serviceA', (c) => new ServiceA(c.cradle));
  container.register('serviceB', (c) => new ServiceB(c.cradle));
  return container;
}

describe('Container primitive (extended DI base layer)', () => {
  it('resolves singletons lazily and caches them', () => {
    const container = buildContainer();
    const first = container.resolve('serviceA');
    const second = container.resolve('serviceA');
    expect(first).toBe(second);
    expect(first.config.name).toBe('prismgb');
  });

  it('injects dependencies through the lazy cradle proxy', () => {
    const container = buildContainer();
    const serviceB = container.resolve('serviceB');
    expect(serviceB.serviceA).toBe(container.resolve('serviceA'));
  });

  it('keeps the cradle non-enumerable so Object.assign does not eagerly resolve', () => {
    const container = buildContainer();
    const mirror: Record<string, unknown> = {};
    Object.assign(mirror, container.cradle);
    expect(Object.keys(mirror)).toEqual([]);
    expect(container.peek('serviceA')).toBeUndefined();
  });

  it('throws on an unregistered token', () => {
    const container = buildContainer();
    expect(() => container.resolve('missing' as keyof TestTokenMap)).toThrow(
      'Dependency token "missing" is not registered'
    );
  });

  it('registers pre-built values and reports them via has/peek/tokens', () => {
    const container = buildContainer();
    const value = { id: 'x' };
    container.registerValue('preBuilt', value);
    expect(container.has('preBuilt')).toBe(true);
    expect(container.peek('preBuilt')).toBe(value);
    expect(container.resolve('preBuilt')).toBe(value);
    expect(container.tokens).toEqual(expect.arrayContaining(['config', 'serviceA', 'serviceB', 'preBuilt']));
  });

  it('disposes each resolved instance once via dispose/cleanup and isolates failures', async () => {
    const container = buildContainer();
    const serviceA = container.resolve('serviceA');
    const serviceB = container.resolve('serviceB');
    const exploding = { dispose: vi.fn(() => { throw new Error('boom'); }) };
    container.registerValue('preBuilt' as keyof TestTokenMap, exploding as never);
    const logger = { error: vi.fn() };

    await container.dispose(logger);

    expect(serviceA.disposed).toBe(1);
    expect(serviceB.cleaned).toBe(1);
    expect(exploding.dispose).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalled();
  });

  it('disposes override-injected instances even when never resolved through a provider', async () => {
    const container = new Container<TestTokenMap>();
    const leaf = { dispose: vi.fn() };
    container.registerValue('preBuilt' as keyof TestTokenMap, leaf as never);

    await container.dispose({ error: vi.fn() });

    expect(leaf.dispose).toHaveBeenCalledTimes(1);
  });
});
