/**
 * createOnEventDecorator / BaseOrchestrator event-binding walk unit tests
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseOrchestrator, createOnEventDecorator, getEventHandlerBindings } from '@platform/core';

type TestPayloadMap = {
  'test:alpha': { value: number };
  'test:beta': string;
  'test:void': void;
};

const OnTestEvent = createOnEventDecorator<TestPayloadMap>();

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

class AlphaOrchestrator extends BaseOrchestrator {
  received: unknown[] = [];

  constructor(dependencies: object) {
    super(dependencies, 'AlphaOrchestrator');
  }

  @OnTestEvent('test:alpha')
  handleAlpha(payload: { value: number }): void {
    this.received.push(payload);
  }

  @OnTestEvent('test:void')
  handleVoid(): void {
    this.received.push('void');
  }
}

class SubAlphaOrchestrator extends AlphaOrchestrator {}

class StackedOrchestrator extends BaseOrchestrator {
  calls: number = 0;

  constructor(dependencies: object) {
    super(dependencies, 'StackedOrchestrator');
  }

  @OnTestEvent('test:beta')
  @OnTestEvent('test:void')
  handleEither(): void {
    this.calls += 1;
  }
}

describe('createOnEventDecorator', () => {
  it('registers a (channel, method) binding per decorated method', () => {
    const bindings = getEventHandlerBindings(AlphaOrchestrator);

    expect(bindings).toEqual(expect.arrayContaining([
      { channel: 'test:alpha', methodKey: 'handleAlpha' },
      { channel: 'test:void', methodKey: 'handleVoid' }
    ]));
    expect(bindings).toHaveLength(2);
  });

  it('exposes inherited bindings to subclasses exactly once', () => {
    const bindings = getEventHandlerBindings(SubAlphaOrchestrator);

    expect(bindings).toEqual(expect.arrayContaining([
      { channel: 'test:alpha', methodKey: 'handleAlpha' },
      { channel: 'test:void', methodKey: 'handleVoid' }
    ]));
    expect(bindings).toHaveLength(2);
  });

  it('supports stacking multiple channels onto one method', () => {
    const bindings = getEventHandlerBindings(StackedOrchestrator);

    expect(bindings).toEqual(expect.arrayContaining([
      { channel: 'test:beta', methodKey: 'handleEither' },
      { channel: 'test:void', methodKey: 'handleEither' }
    ]));
    expect(bindings).toHaveLength(2);
  });

  it('returns no bindings for undecorated classes', () => {
    expect(getEventHandlerBindings(BaseOrchestrator)).toEqual([]);
  });
});

describe('BaseOrchestrator declared-event subscription', () => {
  it('subscribes each declared channel through the instance event bus on initialize', async () => {
    const { bus } = createRecordingBus();
    const orchestrator = new AlphaOrchestrator({ eventBus: bus });

    await orchestrator.initialize();

    expect(bus.subscribe).toHaveBeenCalledWith('test:alpha', expect.any(Function));
    expect(bus.subscribe).toHaveBeenCalledWith('test:void', expect.any(Function));
    expect(bus.subscribe).toHaveBeenCalledTimes(2);
  });

  it('invokes the decorated method with the payload and instance context', async () => {
    const { bus, handlers } = createRecordingBus();
    const orchestrator = new AlphaOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    handlers.get('test:alpha')?.({ value: 42 });
    handlers.get('test:void')?.(undefined);

    expect(orchestrator.received).toEqual([{ value: 42 }, 'void']);
  });

  it('subscribes a stacked method once per declared channel', async () => {
    const { bus, handlers } = createRecordingBus();
    const orchestrator = new StackedOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    handlers.get('test:beta')?.('payload');
    handlers.get('test:void')?.(undefined);

    expect(bus.subscribe).toHaveBeenCalledTimes(2);
    expect(orchestrator.calls).toBe(2);
  });

  it('disposes every declared subscription on cleanup', async () => {
    const { bus, unsubscribes } = createRecordingBus();
    const orchestrator = new AlphaOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    await orchestrator.cleanup();

    expect(unsubscribes).toHaveLength(2);
    for (const unsubscribe of unsubscribes) {
      expect(unsubscribe).toHaveBeenCalled();
    }
  });

  it('does not double-subscribe on duplicate initialize', async () => {
    const { bus } = createRecordingBus();
    const orchestrator = new AlphaOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    await orchestrator.initialize();

    expect(bus.subscribe).toHaveBeenCalledTimes(2);
  });

  it('re-subscribes after a cleanup and re-initialize cycle', async () => {
    const { bus } = createRecordingBus();
    const orchestrator = new AlphaOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    await orchestrator.cleanup();
    await orchestrator.initialize();

    expect(bus.subscribe).toHaveBeenCalledTimes(4);
  });

  it('skips subscription without an event bus', async () => {
    const orchestrator = new AlphaOrchestrator({});

    await expect(orchestrator.initialize()).resolves.toBeUndefined();
    expect(orchestrator.isInitialized).toBe(true);
  });
});
