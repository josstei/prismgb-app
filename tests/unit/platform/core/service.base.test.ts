import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseService, createOnEventDecorator, type LoggerFactory } from '@platform/core';
import { createLoggerFactory } from '../../../factories/index.js';

type TestPayloadMap = {
  'test:alpha': { value: number };
  'test:void': void;
};

const OnTestEvent = createOnEventDecorator<TestPayloadMap>();

function createRecordingSource() {
  const handlers = new Map<string, (payload: unknown) => unknown>();
  const unsubscribes: Array<ReturnType<typeof vi.fn>> = [];
  const source = {
    subscribe: vi.fn((channel: string, handler: (payload: unknown) => unknown) => {
      handlers.set(channel, handler);
      const unsubscribe = vi.fn();
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    })
  };
  return { source, handlers, unsubscribes };
}

class TestService extends BaseService {
  received: unknown[] = [];

  constructor(loggerFactory: LoggerFactory) {
    super(loggerFactory, 'TestService');
  }

  bind(source: Parameters<BaseService['bindEventHandlers']>[0]): void {
    this.bindEventHandlers(source);
  }

  @OnTestEvent('test:alpha')
  handleAlpha(payload: { value: number }): void {
    this.received.push(payload);
  }

  @OnTestEvent('test:void')
  async handleVoid(): Promise<void> {
    this.received.push('void');
  }
}

describe('BaseService', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;

  beforeEach(() => {
    loggerFactory = createLoggerFactory();
  });

  it('creates its logger from the factory under the given name', () => {
    new TestService(loggerFactory);

    expect(loggerFactory.create).toHaveBeenCalledWith('TestService');
  });

  it('subscribes every decorated handler and forwards payloads with instance context', async () => {
    const { source, handlers } = createRecordingSource();
    const service = new TestService(loggerFactory);

    service.bind(source);
    handlers.get('test:alpha')?.({ value: 7 });
    const result = handlers.get('test:void')?.(undefined);

    expect(source.subscribe).toHaveBeenCalledTimes(2);
    expect(service.received).toEqual([{ value: 7 }, 'void']);
    expect(result).toBeInstanceOf(Promise);
  });

  it('releases bound subscriptions on dispose', async () => {
    const { source, unsubscribes } = createRecordingSource();
    const service = new TestService(loggerFactory);

    service.bind(source);
    await service.dispose();

    expect(unsubscribes).toHaveLength(2);
    for (const unsubscribe of unsubscribes) {
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    }
  });

  it('disposes tracked timers', async () => {
    vi.useFakeTimers();
    try {
      const service = new TestService(loggerFactory);
      const handler = vi.fn();

      service.disposables.timeout(handler, 1000);
      service.disposables.interval(handler, 100);
      await service.dispose();
      vi.advanceTimersByTime(2000);

      expect(handler).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('tolerates repeated dispose calls', async () => {
    const { source } = createRecordingSource();
    const service = new TestService(loggerFactory);
    service.bind(source);

    await expect(service.dispose()).resolves.toBeUndefined();
    await expect(service.dispose()).resolves.toBeUndefined();
  });
});
