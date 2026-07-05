/**
 * BaseService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { BaseService, type EventBusLike, type LoggerFactoryLike, type LoggerLike } from '@platform/core';
import { createEventBus, createLoggerFactory } from '../../../factories/index.js';

type MockEventBus = EventBusLike &
  ReturnType<typeof createEventBus> & {
    subscribe: MockedFunction<EventBusLike['subscribe']>;
  };
type MockLoggerFactory = LoggerFactoryLike & ReturnType<typeof createLoggerFactory>;
type ServiceDependencies = {
  eventBus?: MockEventBus;
  loggerFactory?: MockLoggerFactory;
};
type InjectedServiceShape = {
  eventBus?: MockEventBus;
  loggerFactory?: MockLoggerFactory;
  logger?: LoggerLike;
  _serviceName: string;
  _initialized: boolean;
};

describe('BaseService', () => {
  let mockEventBus: MockEventBus;
  let mockLoggerFactory: MockLoggerFactory;
  let mockLogger: LoggerLike;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory() as MockLoggerFactory;
    mockLogger = mockLoggerFactory.create('TestService');
    mockEventBus = createEventBus() as MockEventBus;
  });

  describe('Constructor', () => {
    it('should create service with valid dependencies', () => {
      const service = new BaseService(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        'TestService'
      );
      const injected = service as unknown as InjectedServiceShape;

      expect(injected.eventBus).toBe(mockEventBus);
      expect(injected.loggerFactory).toBe(mockLoggerFactory);
      expect(injected.logger).toBe(mockLogger);
      expect(injected._serviceName).toBe('TestService');
    });

    it('should use constructor name if serviceName not provided', () => {
      class MyService extends BaseService {
        constructor(deps: ServiceDependencies) {
          super(deps);
        }
      }

      const service = new MyService({ loggerFactory: mockLoggerFactory });

      expect((service as unknown as InjectedServiceShape)._serviceName).toBe('MyService');
    });

    it('should work without loggerFactory', () => {
      const service = new BaseService(
        { eventBus: mockEventBus },
        'TestService'
      );

      expect((service as unknown as InjectedServiceShape).logger).toBeUndefined();
    });
  });

  describe('Lifecycle helpers', () => {
    let service: BaseService;

    beforeEach(() => {
      service = new BaseService(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        'TestService'
      );
    });

    it('tracks EventBus subscriptions through listen()', async () => {
      const listener = vi.fn();
      const unsub = vi.fn();
      mockEventBus.subscribe = vi.fn(() => unsub) as MockedFunction<EventBusLike['subscribe']>;

      const stopListening = service.listen('device:connected', listener);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('device:connected', listener);
      expect(unsub).not.toHaveBeenCalled();

      await service.dispose();
      stopListening();
      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it('tracks timeout and interval lifecycles and clears them on dispose', async () => {
      vi.useFakeTimers();

      const timeoutHandler = vi.fn();
      const intervalHandler = vi.fn();

      service.timeout(timeoutHandler, 1000);
      service.interval(intervalHandler, 100);

      await service.dispose();
      vi.advanceTimersByTime(2000);

      expect(timeoutHandler).not.toHaveBeenCalled();
      expect(intervalHandler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('throws nothing when dispose is called multiple times', async () => {
      const unsub = vi.fn();
      mockEventBus.subscribe = vi.fn(() => unsub) as MockedFunction<EventBusLike['subscribe']>;
      service.listen('one', vi.fn());

      await expect(service.dispose()).resolves.toBeUndefined();
      await expect(service.dispose()).resolves.toBeUndefined();
    });
  });

  describe('initialize', () => {
    it('should warn and return early if already initialized', () => {
      const service = new BaseService({ loggerFactory: mockLoggerFactory }, 'TestService');

      service.initialize();
      service.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith('TestService already initialized');
    });

    it('should call a synchronous onInitialize and set _initialized synchronously', () => {
      class SyncService extends BaseService {
        hookCalled = false;

        protected override onInitialize(): void {
          this.hookCalled = true;
        }
      }

      const service = new SyncService({ loggerFactory: mockLoggerFactory }, 'SyncService');
      service.initialize();

      expect(service.hookCalled).toBe(true);
      expect((service as unknown as InjectedServiceShape)._initialized).toBe(true);
    });

    it('should not warn twice in a row when a synchronous hook already ran', () => {
      class CountingService extends BaseService {
        callCount: number;

        constructor(deps: ServiceDependencies, name: string) {
          super(deps, name);
          this.callCount = 0;
        }

        protected override onInitialize(): void {
          this.callCount += 1;
        }
      }

      const service = new CountingService({ loggerFactory: mockLoggerFactory }, 'CountingService');
      service.initialize();
      service.initialize();

      expect(service.callCount).toBe(1);
    });

    it('should defer _initialized until an asynchronous onInitialize resolves', async () => {
      class AsyncService extends BaseService {
        hookCalled = false;

        protected override async onInitialize(): Promise<void> {
          await Promise.resolve();
          this.hookCalled = true;
        }
      }

      const service = new AsyncService({ loggerFactory: mockLoggerFactory }, 'AsyncService');
      const result = service.initialize();

      expect((service as unknown as InjectedServiceShape)._initialized).toBe(false);

      await result;

      expect(service.hookCalled).toBe(true);
      expect((service as unknown as InjectedServiceShape)._initialized).toBe(true);
    });

    it('should default to a no-op onInitialize', () => {
      const service = new BaseService({ loggerFactory: mockLoggerFactory }, 'TestService');

      expect(() => service.initialize()).not.toThrow();
      expect((service as unknown as InjectedServiceShape)._initialized).toBe(true);
    });
  });

  describe('keyed scheduling', () => {
    it('replaces a pending keyed timeout scheduled under the same key', () => {
      vi.useFakeTimers();
      try {
        const service = new BaseService({ loggerFactory: createLoggerFactory() }, 'KeyedService');
        const first = vi.fn();
        const second = vi.fn();

        service.schedule('job', first, 100);
        service.schedule('job', second, 100);
        vi.advanceTimersByTime(100);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancelScheduled stops a keyed interval', () => {
      vi.useFakeTimers();
      try {
        const service = new BaseService({ loggerFactory: createLoggerFactory() }, 'KeyedService');
        const handler = vi.fn();

        service.scheduleInterval('poll', handler, 50);
        vi.advanceTimersByTime(100);
        expect(handler).toHaveBeenCalledTimes(2);

        service.cancelScheduled('poll');
        vi.advanceTimersByTime(100);
        expect(handler).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
