import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseService } from '@platform/core';

class TestService extends BaseService {
  onStart: () => void | Promise<void> = () => {};
  protected override onInitialize(): void | Promise<void> { return this.onStart(); }
  get initialized(): boolean { return this._initialized; }
}

function dependencies() {
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const unsubscribe = vi.fn();
  return {
    logger, unsubscribe,
    loggerFactory: { create: vi.fn(() => logger) },
    eventBus: { publish: vi.fn(), subscribe: vi.fn(() => unsubscribe) }
  };
}

describe('BaseService', () => {
  let deps: ReturnType<typeof dependencies>;
  let service: TestService;
  beforeEach(() => {
    deps = dependencies();
    service = new TestService(deps, 'TestService');
  });

  it('derives the logger context from the class name when no name is supplied', () => {
    class NamedService extends BaseService {}
    new NamedService(deps);
    expect(deps.loggerFactory.create).toHaveBeenLastCalledWith('NamedService');
  });

  it('supports the default hooks and missing optional logger/event bus', async () => {
    const optional = new BaseService({});
    optional.initialize();
    optional.listen('missing', vi.fn())();
    await optional.dispose();
  });

  it('owns subscriptions and releases them once across disposal and explicit release', async () => {
    const listener = vi.fn();
    const stopListening = service.listen('device:connected', listener);
    expect(deps.eventBus.subscribe).toHaveBeenCalledWith('device:connected', listener);
    expect(deps.unsubscribe).not.toHaveBeenCalled();
    await Promise.all([service.dispose(), service.dispose()]);
    stopListening();
    expect(deps.unsubscribe).toHaveBeenCalledOnce();
  });

  it('runs a synchronous hook once and marks readiness synchronously', () => {
    service.onStart = vi.fn();
    expect(service.initialized).toBe(false);
    service.initialize();
    expect(service.initialized).toBe(true);
    service.initialize();
    expect(service.onStart).toHaveBeenCalledOnce();
    expect(deps.logger.warn).toHaveBeenCalledWith('TestService already initialized');
  });

  it('shares asynchronous initialization and marks readiness only after completion', async () => {
    const pending = Promise.withResolvers<void>();
    service.onStart = vi.fn(() => pending.promise);
    const initializing = service.initialize();
    expect(service.initialize()).toBe(initializing);
    expect(service.initialized).toBe(false);
    pending.resolve();
    await initializing;
    expect(service.onStart).toHaveBeenCalledOnce();
    expect(service.initialized).toBe(true);
  });

  it('preserves initialization failure while still attempting failing rollback', async () => {
    const pending = Promise.withResolvers<void>();
    const failure = new Error('initialize failed');
    const cleanup = vi.fn(() => { throw new Error('cleanup failed'); });
    service.onStart = () => { service.track(cleanup); return pending.promise; };
    const initializing = service.initialize();
    expect(service.initialize()).toBe(initializing);
    pending.reject(failure);
    await expect(initializing).rejects.toBe(failure);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(service.initialized).toBe(false);
  });

  it('does not revive readiness after disposal overtakes initialization, and can restart afterward', async () => {
    const pending = Promise.withResolvers<void>();
    const firstRelease = vi.fn();
    const nextRelease = vi.fn();
    service.onStart = () => { service.track(firstRelease); return pending.promise; };
    const initializing = service.initialize();
    await Promise.all([service.dispose(), service.dispose()]);
    expect(firstRelease).toHaveBeenCalledOnce();
    pending.resolve();
    await initializing;
    expect(service.initialized).toBe(false);
    expect(service.disposables.size).toBe(0);

    service.onStart = () => { service.track(nextRelease); };
    await service.initialize();
    expect(service.initialized).toBe(true);
    expect(nextRelease).not.toHaveBeenCalled();
    await service.dispose();
    expect(nextRelease).toHaveBeenCalledOnce();
  });
});
