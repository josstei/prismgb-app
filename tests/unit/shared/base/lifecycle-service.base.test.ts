import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LifecycleService } from '@prismgb/core';

type TestDependencies = {
  eventBus?: {
    subscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  loggerFactory: {
    create: () => {
      info: ReturnType<typeof vi.fn>;
      debug: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
  };
};

class TestService extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;
  initCalled = false;
  disposeCalled = false;

  constructor(deps: Record<string, unknown>) {
    super(deps, [...TestService.dependencies], 'TestService');
  }

  async onInitialize(): Promise<void> {
    this.initCalled = true;
  }

  async onDispose(): Promise<void> {
    this.disposeCalled = true;
  }
}

class NoBusService extends LifecycleService {
  static readonly dependencies = ['loggerFactory'] as const;

  constructor(deps: Record<string, unknown>) {
    super(deps, [...NoBusService.dependencies], 'NoBusService');
  }
}

function createMockDeps(): TestDependencies {
  return {
    eventBus: {
      subscribe: vi.fn(() => vi.fn()),
      publish: vi.fn()
    },
    loggerFactory: {
      create: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    }
  };
}

describe('LifecycleService', () => {
  let service: TestService;
  let deps: TestDependencies;

  beforeEach(() => {
    deps = createMockDeps();
    service = new TestService(deps as unknown as Record<string, unknown>);
  });

  describe('initialize', () => {
    it('calls onInitialize and sets lifecycle state', async () => {
      await service.initialize();
      expect(service.initCalled).toBe(true);
      expect(service.isInitialized).toBe(true);
      expect(service.isDisposed).toBe(false);
    });

    it('skips duplicate initialize calls', async () => {
      await service.initialize();
      service.initCalled = false;
      await service.initialize();
      expect(service.initCalled).toBe(false);
    });

    it('propagates initialization errors', async () => {
      const error = new Error('init failed');
      service.onInitialize = async () => { throw error; };
      await expect(service.initialize()).rejects.toThrow('init failed');
      expect(service.isInitialized).toBe(false);
    });
  });

  describe('dispose', () => {
    it('calls onDispose and sets disposed state', async () => {
      await service.initialize();
      await service.dispose();
      expect(service.disposeCalled).toBe(true);
      expect(service.isInitialized).toBe(false);
      expect(service.isDisposed).toBe(true);
    });

    it('skips duplicate dispose calls', async () => {
      await service.initialize();
      await service.dispose();
      service.disposeCalled = false;
      await service.dispose();
      expect(service.disposeCalled).toBe(false);
    });

    it('cleans up subscriptions on dispose', async () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      deps.eventBus?.subscribe.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2);

      service.subscribeWithCleanup({
        'event:a': vi.fn(),
        'event:b': vi.fn()
      });

      await service.initialize();
      await service.dispose();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });

    it('continues dispose even if onDispose throws', async () => {
      service.onDispose = async () => { throw new Error('dispose failed'); };
      await service.initialize();
      await service.dispose();
      expect(service.isDisposed).toBe(true);
    });
  });

  describe('subscribeWithCleanup', () => {
    it('subscribes to all events in map', () => {
      const handlers = { 'event:a': vi.fn(), 'event:b': vi.fn() };
      service.subscribeWithCleanup(handlers);
      expect(deps.eventBus?.subscribe).toHaveBeenCalledTimes(2);
      expect(deps.eventBus?.subscribe).toHaveBeenCalledWith('event:a', handlers['event:a']);
      expect(deps.eventBus?.subscribe).toHaveBeenCalledWith('event:b', handlers['event:b']);
    });

    it('does not throw when eventBus is unavailable', () => {
      const noBusService = new NoBusService({
        ...deps,
        eventBus: undefined
      } as unknown as Record<string, unknown>);

      expect(() => noBusService.subscribeWithCleanup({ x: vi.fn() })).not.toThrow();
    });
  });
});
