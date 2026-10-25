import { describe, expect, it } from 'vitest';
import { AppState } from '@renderer/application/state/app-state';
import { effect } from '@platform/ui-base/reactive';
import type { StreamingCapabilities } from '@platform/events';

function createState() {
  const streaming = {
    isStreaming: false,
    currentCapabilities: null as StreamingCapabilities | null,
    stream: null as MediaStream | null,
    getStream() { return this.stream; }
  };
  const device = { isConnected: false };
  const state = new AppState({ streamingService: streaming, rendererDeviceRuntime: device });
  return { state, streaming, device };
}

describe('AppState', () => {
  it('reads current media state directly across start, disconnect and stop', () => {
    const { state, streaming, device } = createState();
    expect(state.isStreaming).toBe(false);
    expect(state.currentStream).toBeNull();
    expect(state.currentCapabilities).toBeNull();
    expect(state.deviceConnected).toBe(false);

    const stream = new MediaStream();
    const capabilities = { nativeResolution: { width: 160, height: 144 }, frameRate: 60 };
    Object.assign(streaming, { isStreaming: true, stream, currentCapabilities: capabilities });
    device.isConnected = true;
    expect(state.isStreaming).toBe(true);
    expect(state.currentStream).toBe(stream);
    expect(state.currentCapabilities).toBe(capabilities);
    expect(state.deviceConnected).toBe(true);

    Object.assign(streaming, { isStreaming: false, stream: null, currentCapabilities: null });
    device.isConnected = false;
    expect(state.isStreaming).toBe(false);
    expect(state.currentStream).toBeNull();
    expect(state.currentCapabilities).toBeNull();
    expect(state.deviceConnected).toBe(false);
  });

  it('keeps cinematic preference reactive and independent of media state', () => {
    const { state, streaming } = createState();
    const values: boolean[] = [];
    const stop = effect(() => { values.push(state.cinematicModeSignal.value); });
    state.setCinematicMode(false);
    streaming.isStreaming = true;
    expect(state.isCinematicModeEnabled).toBe(false);
    state.setCinematicMode(true);
    expect(values).toEqual([true, false, true]);
    stop();
  });
});
