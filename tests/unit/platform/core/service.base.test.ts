/**
 * BaseService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import {
  BaseService,
  createOnEventDecorator,
  type EventBusLike,
  type LoggerFactoryLike,
  type LoggerLike
} from '@platform/core';
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

type TestPayloadMap = {
  'service:alpha': { value: number };
  'service:void': void;
};

const OnServiceEvent = createOnEventDecorator<TestPayloadMap>();

function createRecordingBus() {
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  const handlers = new Map<string, (payload: unknown) => void | Promise<void>>();
  const bus = {
    publish: vi.fn(),
    subscribe: vi.fn((channel: string, handler: (payload: unknown) => void | Promise<void>) => {
      handlers.set(channel, handler);
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    })
  };
  return { bus, handlers, unsubscribes };
}

function createDeferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

class EventBoundService extends BaseService {
  received: unknown[] = [];
  onInitializeOrder: string[];

  constructor(dependencies: object) {
    super(dependencies, 'EventBoundService');
    this.onInitializeOrder = [];
  }

  protected override onInitialize(): void {
    this.onInitializeOrder.push('onInitialize');
  }

  @OnServiceEvent('service:alpha')
  handleAlpha(payload: { value: number }): void {
    this.received.push(payload);
  }

  @OnServiceEvent('service:void')
  handleVoid(): void {
    this.received.push('void');
  }
}

class QueuedAsyncEventBoundService extends EventBoundService {
  private readonly initPromises: Promise<void>[];

  constructor(dependencies: object, initPromises: Promise<void>[]) {
    super(dependencies);
    this.initPromises = initPromises;
  }

  protected override onInitialize(): Promise<void> {
    this.onInitializeOrder.push('onInitialize');
    return this.initPromises.shift() ?? Promise.resolve();
  }
}

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

    it('subscribes declared event handlers before onInitialize', () => {
      const { bus } = createRecordingBus();
      const service = new EventBoundService({ eventBus: bus, loggerFactory: mockLoggerFactory });

      service.initialize();

      expect(bus.subscribe).toHaveBeenCalledWith('service:alpha', expect.any(Function));
      expect(bus.subscribe).toHaveBeenCalledWith('service:void', expect.any(Function));
      expect(bus.subscribe).toHaveBeenCalledTimes(2);
      expect(service.onInitializeOrder).toEqual(['onInitialize']);
    });

    it('invokes decorated service handlers with payload and instance context', () => {
      const { bus, handlers } = createRecordingBus();
      const service = new EventBoundService({ eventBus: bus, loggerFactory: mockLoggerFactory });

      service.initialize();
      handlers.get('service:alpha')?.({ value: 42 });
      handlers.get('service:void')?.(undefined);

      expect(service.received).toEqual([{ value: 42 }, 'void']);
    });

    it('does not double-subscribe declared service handlers on duplicate initialize', () => {
      const { bus } = createRecordingBus();
      const service = new EventBoundService({ eventBus: bus, loggerFactory: mockLoggerFactory });

      service.initialize();
      service.initialize();

      expect(bus.subscribe).toHaveBeenCalledTimes(2);
    });

    it('does not double-subscribe declared service handlers while async initialize is pending', async () => {
      const deferred = createDeferred();
      const { bus } = createRecordingBus();
      const service = new QueuedAsyncEventBoundService(
        { eventBus: bus, loggerFactory: mockLoggerFactory },
        [deferred.promise]
      );

      const firstInitialize = service.initialize();
      const secondInitialize = service.initialize();

      expect(secondInitialize).toBe(firstInitialize);
      expect(bus.subscribe).toHaveBeenCalledTimes(2);
      expect(service.onInitializeOrder).toEqual(['onInitialize']);
      expect(mockLoggerFactory._getLogger('EventBoundService')?.warn)
        .toHaveBeenCalledWith('EventBoundService already initialized');

      deferred.resolve();
      await firstInitialize;

      expect((service as unknown as InjectedServiceShape)._initialized).toBe(true);
    });

    it('releases declared service subscriptions before retrying after async initialize rejects', async () => {
      const firstAttempt = createDeferred();
      const secondAttempt = createDeferred();
      const { bus, unsubscribes } = createRecordingBus();
      const service = new QueuedAsyncEventBoundService(
        { eventBus: bus, loggerFactory: mockLoggerFactory },
        [firstAttempt.promise, secondAttempt.promise]
      );

      const failedInitialize = service.initialize();
      firstAttempt.reject(new Error('init failed'));

      await expect(failedInitialize).rejects.toThrow('init failed');
      expect(unsubscribes).toHaveLength(2);
      expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
      expect(unsubscribes[1]).toHaveBeenCalledTimes(1);
      expect((service as unknown as InjectedServiceShape)._initialized).toBe(false);

      const retryInitialize = service.initialize();

      expect(bus.subscribe).toHaveBeenCalledTimes(4);
      secondAttempt.resolve();
      await retryInitialize;

      expect((service as unknown as InjectedServiceShape)._initialized).toBe(true);
    });

    it('disposes declared service subscriptions', async () => {
      const { bus, unsubscribes } = createRecordingBus();
      const service = new EventBoundService({ eventBus: bus, loggerFactory: mockLoggerFactory });

      service.initialize();
      await service.dispose();

      expect(unsubscribes).toHaveLength(2);
      for (const unsubscribe of unsubscribes) {
        expect(unsubscribe).toHaveBeenCalled();
      }
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
