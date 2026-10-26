/**
 * createOnEventDecorator / BaseOrchestrator event-binding walk unit tests
 */

import { describe, it, expect, vi, expectTypeOf } from 'vitest';
import { BaseOrchestrator, createOnEventDecorator } from '@platform/core';
import { getEventHandlerBindings } from '../../../../src/platform/core/primitives/event-decorator';
import { EventChannels, OnEvent, type TypedEventBusLike, type StreamStartedPayload } from '@platform/events';
import { IPC_CHANNELS } from '@platform/ipc';
import { deriveEventChannelMap, type EventChannelMap } from '../../../../src/platform/events/event-channel-derivation.js';

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


/**
 * Type-math coverage for the generic manifest-scope -> channel-map derivation
 * mechanism (mapped/template-literal types, Extract-based scope narrowing).
 */

const sampleEvents = [
  { domain: 'device', name: 'status-changed', value: 'device:status-changed' },
  { domain: 'device', name: 'supported-device-available', value: 'device:supported-device-available' },
  { domain: 'ui', name: 'record-button-pop', value: 'ui:record-button-pop' }
] as const;

type SampleEvent = (typeof sampleEvents)[number];
type SampleChannelMap = EventChannelMap<SampleEvent>;

describe('deriveEventChannelMap', () => {
  it('groups events by SCREAMING_SNAKE domain and name, preserving literal channel values', () => {
    const channels = deriveEventChannelMap(sampleEvents);

    expect(channels).toEqual({
      DEVICE: {
        STATUS_CHANGED: 'device:status-changed',
        SUPPORTED_DEVICE_AVAILABLE: 'device:supported-device-available'
      },
      UI: {
        RECORD_BUTTON_POP: 'ui:record-button-pop'
      }
    });

    expectTypeOf<SampleChannelMap['DEVICE']['STATUS_CHANGED']>().toEqualTypeOf<'device:status-changed'>();
    expectTypeOf<SampleChannelMap['DEVICE']['SUPPORTED_DEVICE_AVAILABLE']>().toEqualTypeOf<'device:supported-device-available'>();
    expectTypeOf<SampleChannelMap['UI']['RECORD_BUTTON_POP']>().toEqualTypeOf<'ui:record-button-pop'>();
  });

  it('rejects manifest events missing the domain/name/value shape at compile time', () => {
    function attemptInvalidShape(): void {
      // @ts-expect-error deriveEventChannelMap requires domain/name/value on every entry
      deriveEventChannelMap([{ domain: 'device' }] as const);
    }

    expect(attemptInvalidShape).toBeTypeOf('function');
  });

  it('keeps derived channel groups readonly, matching the as-const manifest contract', () => {
    const channels = deriveEventChannelMap(sampleEvents);

    // @ts-expect-error derived channel leaves are readonly
    channels.DEVICE.STATUS_CHANGED = 'device:mutated';
  });
});


function flattenEventValues(node: unknown): string[] {
  const values: string[] = [];

  if (!node || typeof node !== 'object') {
    return values;
  }

  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }

    values.push(...flattenEventValues(value));
  }

  return values;
}

describe('Event channel contract', () => {
  it('keeps all event channels unique', () => {
    const values = flattenEventValues(EventChannels);
    expect(new Set(values).size).toBe(values.length);
  });

  it('enforces event naming format', () => {
    const values = flattenEventValues(EventChannels);
    for (const eventName of values) {
      expect(eventName).toMatch(/^[a-z]+:[a-z0-9-]+$/);
    }
  });

  it('defines the full notes event channel set', () => {
    expect(EventChannels.NOTES).toEqual({
      NOTE_CREATED: 'notes:note-created',
      NOTE_UPDATED: 'notes:note-updated',
      NOTE_DELETED: 'notes:note-deleted'
    });
  });

});

function checkPayloadContracts(bus: TypedEventBusLike): void {
  bus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 0.5);
  bus.publish(EventChannels.DEVICE.DISCONNECTED, undefined);
  // @ts-expect-error Numeric settings cannot publish a string.
  bus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, '0.5');
  // @ts-expect-error Notes must use the canonical stored note contract.
  bus.publish(EventChannels.NOTES.NOTE_CREATED, { id: 'incomplete' });
  // @ts-expect-error Removed main-process events are not renderer events.
  bus.publish('device:check-error', { error: 'failed' });
}

it('checks event payload contracts during TypeScript validation', () => {
  expect(checkPayloadContracts).toBeTypeOf('function');
});


/**
 * OnEvent typed decorator unit tests (concrete EventPayloadMap instantiation)
 */


class TypedSubscriberOrchestrator extends BaseOrchestrator {
  payloads: StreamStartedPayload[] = [];

  constructor(dependencies: object) {
    super(dependencies, 'TypedSubscriberOrchestrator');
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  handleStreamStarted(payload: StreamStartedPayload): void {
    this.payloads.push(payload);
  }

  @OnEvent(EventChannels.STREAM.STOPPED)
  handleStreamStopped(): void {}
}

class MistypedSubscriberOrchestrator extends BaseOrchestrator {
  // @ts-expect-error handler payload parameter must match EventPayloadMap['stream:started']
  @OnEvent(EventChannels.STREAM.STARTED)
  handleStreamStarted(_payload: number): void {}
}

describe('OnEvent', () => {
  it('registers bindings against renderer event channels', () => {
    const bindings = getEventHandlerBindings(TypedSubscriberOrchestrator);

    expect(bindings).toEqual(expect.arrayContaining([
      { channel: EventChannels.STREAM.STARTED, methodKey: 'handleStreamStarted' },
      { channel: EventChannels.STREAM.STOPPED, methodKey: 'handleStreamStopped' }
    ]));
    expect(bindings).toHaveLength(2);
  });

  it('delivers published payloads to typed handlers via initialize', async () => {
    const handlers = new Map<string, (payload: unknown) => void | Promise<void>>();
    const bus = {
      publish: vi.fn(),
      subscribe: vi.fn((channel: string, handler: (payload: unknown) => void | Promise<void>) => {
        handlers.set(channel, handler);
        return vi.fn();
      })
    };
    const orchestrator = new TypedSubscriberOrchestrator({ eventBus: bus });

    await orchestrator.initialize();
    const payload = { stream: {}, device: {}, settings: null, capabilities: {} } as StreamStartedPayload;
    handlers.get(EventChannels.STREAM.STARTED)?.(payload);

    expect(orchestrator.payloads).toEqual([payload]);
  });

  it('keeps mistyped handler classes registered at runtime despite compile-time rejection', () => {
    expect(getEventHandlerBindings(MistypedSubscriberOrchestrator)).toHaveLength(1);
  });
});


type ChannelTree = {
  readonly [key: string]: string | ChannelTree;
};

function flattenChannelValues(node: ChannelTree): string[] {
  const values: string[] = [];
  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
    } else if (value && typeof value === 'object') {
      values.push(...flattenChannelValues(value));
    }
  }
  return values;
}

describe('IPC channel contracts', () => {
  it('uses unique channel keys across all namespaces', () => {
    const values = flattenChannelValues(IPC_CHANNELS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('enforces channel naming format', () => {
    const values = flattenChannelValues(IPC_CHANNELS);
    for (const channel of values) {
      expect(channel).toMatch(/^[a-z][a-z-]*:[a-z-]+$/);
    }
  });
});

// These are externally visible push names, not equality checks against the
// EventChannels values from which IPC_CHANNELS is already constructed.
it('preserves the IPC push protocol names and the distinct UI resize event', () => {
  expect(IPC_CHANNELS).toEqual({
    APP: { SHUTDOWN_REQUESTED: 'app:shutdown-requested' },
    DEVICE: { CONNECTED: 'device:connected', DISCONNECTED: 'device:disconnected' },
    WINDOW: { ENTER_FULLSCREEN: 'window:enter-fullscreen', LEAVE_FULLSCREEN: 'window:leave-fullscreen', RESIZED: 'window:resized' },
    UPDATE: { AVAILABLE: 'update:available', NOT_AVAILABLE: 'update:not-available', PROGRESS: 'update:progress', DOWNLOADED: 'update:downloaded', ERROR: 'update:error' },
    TRANSCODE: { PROGRESS: 'transcode:progress', COMPLETED: 'transcode:completed', ERROR: 'transcode:error', CANCELLED: 'transcode:cancelled' }
  });
  expect(EventChannels.UI.WINDOW_RESIZED).toBe('ui:window-resized');
});
