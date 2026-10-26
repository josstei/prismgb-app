import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingAudioOrchestrator } from '@renderer/application/orchestrators/streaming-audio.orchestrator';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { createCaptureStreamMock, createMediaTrackMock } from '../../../../factories/stream.factory.js';
import { createLoggerFactory } from '../../../../factories/logger.factory.js';

describe('streaming audio event routing', () => {
  let orchestrator: StreamingAudioOrchestrator;
  let bus: PlatformEventBus;
  let pipeline: { start: ReturnType<typeof vi.fn<(stream: MediaStream) => Promise<boolean>>>; stop: ReturnType<typeof vi.fn<() => void>> };
  let view: { setMuted: ReturnType<typeof vi.fn<(muted: boolean) => void>> };
  let appState: { isStreaming: boolean };
  const stream = (audio = true) => createCaptureStreamMock({
    audioTracks: audio ? [createMediaTrackMock({ id: 'audio' })] : []
  }) as MediaStream;
  const started = (value: MediaStream) => bus.publish(EventChannels.STREAM.STARTED, { stream: value });
  // Await the actual mocked startup result and its registered reaction chain;
  // waiting for start() to be called can pass before fallback has run.
  const settled = () => pipeline.start.mock.results.at(-1)!.value.catch(() => undefined);

  beforeEach(async () => {
    bus = new PlatformEventBus();
    pipeline = { start: vi.fn<(stream: MediaStream) => Promise<boolean>>(async () => true), stop: vi.fn<() => void>() };
    view = { setMuted: vi.fn<(muted: boolean) => void>() };
    appState = { isStreaming: true };
    orchestrator = new StreamingAudioOrchestrator({
      streamingAudioPipelineService: pipeline, streamViewService: view,
      appState, eventBus: bus, loggerFactory: createLoggerFactory()
    });
    await orchestrator.initialize();
  });
  afterEach(async () => {
    await orchestrator.dispose();
    expect(bus.emitter.eventNames()).toEqual([]);
  });

  it('deduplicates an attached stream and reattaches after both stop and error events', async () => {
    const value = stream();
    started(value);
    started(value);
    await settled();
    expect(pipeline.start).toHaveBeenCalledOnce();
    expect(pipeline.start).toHaveBeenCalledWith(value);
    expect(view.setMuted).not.toHaveBeenCalled();
    for (const event of [EventChannels.STREAM.STOPPED, EventChannels.STREAM.ERROR]) {
      bus.publish(event);
      started(value);
      await settled();
    }
    expect(pipeline.stop).toHaveBeenCalledTimes(2);
    expect(pipeline.start).toHaveBeenCalledTimes(3);
  });

  it.each([false, new Error('warm-up failed')])('unmutes fallback audio once per attachment after %s', async (result) => {
    if (result instanceof Error) pipeline.start.mockRejectedValue(result);
    else pipeline.start.mockResolvedValue(result);
    const value = stream();
    started(value);
    await settled();
    orchestrator._applyVideoAudioFallback();
    started(value);
    expect(view.setMuted).toHaveBeenCalledExactlyOnceWith(false);
    bus.publish(EventChannels.STREAM.STOPPED);
    started(value);
    await settled();
    expect(view.setMuted).toHaveBeenCalledTimes(2);
  });

  it('does not unmute a video-only stream or a stream no longer active', async () => {
    pipeline.start.mockResolvedValue(false);
    started(stream(false));
    await settled();
    started(stream());
    appState.isStreaming = false;
    await settled();
    expect(view.setMuted).not.toHaveBeenCalled();
  });

  it.each([false, new Error('old warm-up failed')])('ignores %s from a stopped or replaced stream', async (result) => {
    const previous = Promise.withResolvers<boolean>();
    pipeline.start.mockReturnValueOnce(previous.promise);
    started(stream());
    bus.publish(EventChannels.STREAM.STOPPED);
    started(stream());
    if (result instanceof Error) previous.reject(result);
    else previous.resolve(result);
    await previous.promise.catch(() => undefined);
    await settled();
    expect(view.setMuted).not.toHaveBeenCalled();
  });
});
