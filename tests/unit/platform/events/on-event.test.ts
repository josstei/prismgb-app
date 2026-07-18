/**
 * OnEvent typed decorator unit tests (concrete EventPayloadMap instantiation)
 */

import { describe, it, expect, vi } from 'vitest';
import { BaseOrchestrator, getEventHandlerBindings } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { StreamStartedPayload } from '@platform/events';

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
