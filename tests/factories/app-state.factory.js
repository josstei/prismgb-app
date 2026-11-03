import { vi } from 'vitest';
import { signal } from '@platform/ui-base/reactive';

/** Mutable state with spyable setters for orchestrator tests. */
export function createAppState({ initialState = {} } = {}) {
  const state = {
    isStreaming: false,
    isCinematicModeEnabled: true,
    deviceConnected: false,
    ...initialState
  };
  const cinematicModeSignal = signal(state.isCinematicModeEnabled);
  const createSetter = (key) => vi.fn((value) => { state[key] = value; });

  return {
    get isStreaming() { return state.isStreaming; },
    get isCinematicModeEnabled() { return cinematicModeSignal.value; },
    get deviceConnected() { return state.deviceConnected; },
    cinematicModeSignal,
    currentStream: null,
    currentCapabilities: null,
    setStreaming: createSetter('isStreaming'),
    setCinematicMode: vi.fn((enabled) => { cinematicModeSignal.value = enabled; }),
    _forceSet(key, value) {
      if (key === 'isCinematicModeEnabled') cinematicModeSignal.value = value;
      state[key] = value;
    }
  };
}
