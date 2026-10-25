import { vi } from 'vitest';
import { signal } from '@platform/ui-base/reactive';

/** Mutable state with spyable setters for workflow and orchestrator tests. */
export function createAppState({ initialState = {} } = {}) {
  const state = {
    isStreaming: false,
    isCinematicModeEnabled: true,
    isRecording: false,
    deviceConnected: false,
    ...initialState
  };
  const cinematicModeSignal = signal(state.isCinematicModeEnabled);
  const createSetter = (key) => vi.fn((value) => { state[key] = value; });

  return {
    get isStreaming() { return state.isStreaming; },
    get isCinematicModeEnabled() { return cinematicModeSignal.value; },
    get isRecording() { return state.isRecording; },
    get deviceConnected() { return state.deviceConnected; },
    cinematicModeSignal,
    currentStream: null,
    currentCapabilities: null,
    setStreaming: createSetter('isStreaming'),
    setCinematicMode: vi.fn((enabled) => { cinematicModeSignal.value = enabled; }),
    setRecording: createSetter('isRecording'),
    setDeviceConnected: createSetter('deviceConnected'),
    _forceSet(key, value) {
      if (key === 'isCinematicModeEnabled') cinematicModeSignal.value = value;
      state[key] = value;
    }
  };
}

export function createStreamingAppState(overrides = {}) {
  return createAppState({
    initialState: {
      isStreaming: true,
      deviceConnected: true,
      ...overrides
    }
  });
}
