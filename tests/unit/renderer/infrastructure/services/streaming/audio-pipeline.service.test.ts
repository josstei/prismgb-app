import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamingAudioPipelineService } from '@renderer/infrastructure/services/streaming/audio-pipeline.service';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
import { createSettingsServiceMock } from '../../../../../factories/settings.factory.js';

function audioGraph(state = 'running') {
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const analyser = { fftSize: 8, connect: vi.fn(), disconnect: vi.fn(), getByteTimeDomainData: vi.fn((buffer: Uint8Array) => buffer.fill(160)) };
  const gain = { connect: vi.fn(), disconnect: vi.fn(), gain: {
    value: 1, cancelScheduledValues: vi.fn(), setValueAtTime: vi.fn(), setValueCurveAtTime: vi.fn(), setTargetAtTime: vi.fn()
  } };
  const context = {
    state, currentTime: 10, sampleRate: 48000, destination: {},
    resume: vi.fn(async () => {}), close: vi.fn(async () => { context.state = 'closed'; }),
    createMediaStreamSource: vi.fn(() => source), createAnalyser: vi.fn(() => analyser), createGain: vi.fn(() => gain)
  };
  return { context, source, analyser, gain };
}
function audioStream(muted = false) {
  const track = Object.assign(new EventTarget(), { muted, getSettings: () => ({ sampleRate: 48000 }) });
  const stream = { getAudioTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}
function createService(...graphs: ReturnType<typeof audioGraph>[]) {
  const eventBus = new PlatformEventBus();
  const constructors: unknown[] = [];
  const pending = [...graphs];
  vi.stubGlobal('AudioContext', function (options: unknown) {
    constructors.push(options);
    if (!pending.length) throw new Error('Unexpected extra audio context');
    return pending.shift()!.context;
  });
  const service = new StreamingAudioPipelineService({ eventBus, loggerFactory: createLoggerFactory(),
    settingsService: createSettingsServiceMock({ values: { gameVolume: 70 } }) });
  return { service, eventBus, constructors };
}

describe('StreamingAudioPipelineService ownership', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('skips missing streams and streams without audio without creating a graph', async () => {
    const { service, constructors } = createService();
    await expect(service.start(null)).resolves.toBe(false);
    await expect(service.start({ getAudioTracks: () => [] } as unknown as MediaStream)).resolves.toBe(false);
    expect(constructors).toEqual([]);
    await service.dispose();
  });

  it('shares startup for the same stream and applies the existing ease-in fade', async () => {
    const graph = audioGraph();
    const { service, constructors } = createService(graph);
    const { stream } = audioStream();
    const first = service.start(stream);
    const second = service.start(stream);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(constructors).toEqual([{ sampleRate: 48000 }]);
    expect(graph.source.connect).toHaveBeenCalledWith(graph.analyser);
    expect(graph.analyser.connect).toHaveBeenCalledWith(graph.gain);
    expect(graph.gain.connect).toHaveBeenCalledWith(graph.context.destination);
    expect(graph.gain.gain.setValueCurveAtTime).toHaveBeenCalledOnce();
    const [curve, time, duration] = graph.gain.gain.setValueCurveAtTime.mock.calls[0];
    expect(curve).toHaveLength(64);
    expect(curve[0]).toBe(0);
    expect(curve[63]).toBeCloseTo(0.7);
    expect([time, duration]).toEqual([10, 0.65]);
    await expect(service.start(stream)).resolves.toBe(true);
    await service.dispose();
  });

  it('clamps volume through the real event subscription only after the graph is ready', async () => {
    const graph = audioGraph();
    const { service, eventBus } = createService(graph);
    const started = service.start(audioStream().stream);
    eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 150);
    expect(graph.gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await started;
    eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, 150);
    expect(graph.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 10, 0.02);
    eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, -5);
    expect(graph.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 10, 0.02);
    await service.dispose();
    expect(eventBus.emitter.eventNames()).toEqual([]);
  });

  it('waits for an unmute event and cancels its listener and timeout during stop', async () => {
    const graph = audioGraph();
    const { service } = createService(graph);
    const { stream, track } = audioStream(true);
    const started = service.start(stream);
    service.stop();
    await expect(started).resolves.toBe(false);
    expect(graph.source.disconnect).toHaveBeenCalledOnce();
    expect(graph.analyser.disconnect).toHaveBeenCalledOnce();
    expect(graph.gain.disconnect).toHaveBeenCalledOnce();
    expect(graph.context.close).toHaveBeenCalledOnce();
    track.dispatchEvent(new Event('unmute'));
    await vi.advanceTimersByTimeAsync(4000);
    expect(graph.gain.gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    await service.dispose();
  });

  it('retains unmute timeout fallback and silent-energy fallback before becoming ready', async () => {
    const graph = audioGraph();
    graph.analyser.getByteTimeDomainData.mockImplementation((buffer) => buffer.fill(128));
    const { service } = createService(graph);
    const started = service.start(audioStream(true).stream);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(started).resolves.toBe(true);
    expect(graph.gain.gain.setValueCurveAtTime).toHaveBeenCalledOnce();
    await service.dispose();
  });

  it.each(['resolve', 'reject'] as const)('a superseded resume %s cannot close or change the replacement graph', async (outcome) => {
    const oldGraph = audioGraph('suspended');
    const replacement = audioGraph();
    const resumed = Promise.withResolvers<void>();
    oldGraph.context.resume.mockReturnValue(resumed.promise);
    const { service } = createService(oldGraph, replacement);
    const oldStart = service.start(audioStream().stream);
    const newStream = audioStream().stream;
    const newStart = service.start(newStream);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(newStart).resolves.toBe(true);
    if (outcome === 'resolve') resumed.resolve(); else resumed.reject(new Error('Old context closed'));
    await expect(oldStart).resolves.toBe(false);
    expect(oldGraph.context.close).toHaveBeenCalledOnce();
    expect(oldGraph.gain.gain.setValueCurveAtTime).not.toHaveBeenCalled();
    expect(replacement.context.close).not.toHaveBeenCalled();
    await expect(service.start(newStream)).resolves.toBe(true);
    await service.dispose();
    expect(replacement.context.close).toHaveBeenCalledOnce();
  });

  it('releases a partially constructed graph when node creation fails and permits retry', async () => {
    const failed = audioGraph();
    failed.context.createGain.mockImplementation(() => { throw new Error('Gain creation failed'); });
    const replacement = audioGraph();
    const { service } = createService(failed, replacement);
    await expect(service.start(audioStream().stream)).rejects.toThrow('Gain creation failed');
    expect(failed.context.close).toHaveBeenCalledOnce();
    expect(failed.source.disconnect).toHaveBeenCalledOnce();
    expect(failed.analyser.disconnect).toHaveBeenCalledOnce();
    const started = service.start(audioStream().stream);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(started).resolves.toBe(true);
    await service.dispose();
  });

  it('disposal joins an audio context close already started by stop', async () => {
    const graph = audioGraph();
    const close = Promise.withResolvers<void>();
    graph.context.close.mockReturnValue(close.promise);
    const { service } = createService(graph);
    const started = service.start(audioStream().stream);
    await vi.advanceTimersByTimeAsync(1000);
    await started;
    service.stop();
    const disposed = vi.fn();
    const disposing = Promise.resolve(service.dispose()).then(disposed);
    await Promise.resolve();
    expect(disposed).not.toHaveBeenCalled();
    close.resolve();
    await disposing;
    expect(disposed).toHaveBeenCalledOnce();
    expect(graph.context.close).toHaveBeenCalledOnce();
  });

  it('rejects and releases the graph if a later analyser sample throws', async () => {
    const graph = audioGraph();
    graph.analyser.getByteTimeDomainData
      .mockImplementationOnce((buffer) => buffer.fill(160))
      .mockImplementationOnce(() => { throw new Error('Analyser disconnected'); });
    const { service } = createService(graph);
    const failed = expect(service.start(audioStream().stream)).rejects.toThrow('Analyser disconnected');
    await vi.advanceTimersByTimeAsync(100);
    await failed;
    expect(graph.context.close).toHaveBeenCalledOnce();
    expect(graph.source.disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await service.dispose();
  });

  it('retains the default-context fallback if a track sample rate is unsupported', async () => {
    const graph = audioGraph();
    const { service } = createService();
    const options: unknown[] = [];
    vi.stubGlobal('AudioContext', function (value: unknown) {
      options.push(value);
      if (value) throw new Error('Unsupported sample rate');
      return graph.context;
    });
    const started = service.start(audioStream().stream);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(started).resolves.toBe(true);
    expect(options).toEqual([{ sampleRate: 48000 }, undefined]);
    await service.dispose();
  });
});
