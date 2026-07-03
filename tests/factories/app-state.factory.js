// @ts-nocheck
/**
 * AppState Factory
 *
 * Creates mock AppState instances for testing.
 * Supports state change tracking and validation.
 */

import { vi } from 'vitest';
import { PRESET_POLICY } from '@platform/gpu';

/**
 * Default application state
 */
const DEFAULT_STATE = {
  isStreaming: false,
  selectedDeviceId: null,
  isCinematicModeEnabled: true,
  isRecording: false,
  recordingBlob: null,
  deviceConnected: false,
  isFullscreen: false,
  volume: 70,
  brightness: 1.0,
  performanceMode: false,
  renderPreset: PRESET_POLICY.rendererDefaultId,
};

/**
 * Creates a mock AppState
 * @param {Object} [options] - Factory options
 * @param {Object} [options.initialState] - Initial state values
 * @param {boolean} [options.trackChanges] - Whether to track state changes
 * @returns {Object} Mock AppState instance
 */
export function createAppState(options = {}) {
  const {
    initialState = {},
    trackChanges = true,
  } = options;

  const state = { ...DEFAULT_STATE, ...initialState };
  const changeHistory = [];

  const recordChange = (key, oldValue, newValue) => {
    if (trackChanges) {
      changeHistory.push({
        key,
        oldValue,
        newValue,
        timestamp: Date.now(),
      });
    }
  };

  const createSetter = (key) => vi.fn((value) => {
    const oldValue = state[key];
    if (oldValue !== value) {
      state[key] = value;
      recordChange(key, oldValue, value);
    }
  });

  const appState = {
    // ==========================================
    // State Getters
    // ==========================================

    get isStreaming() { return state.isStreaming; },
    get selectedDeviceId() { return state.selectedDeviceId; },
    get isCinematicModeEnabled() { return state.isCinematicModeEnabled; },
    get isRecording() { return state.isRecording; },
    get recordingBlob() { return state.recordingBlob; },
    get deviceConnected() { return state.deviceConnected; },
    get isFullscreen() { return state.isFullscreen; },
    get volume() { return state.volume; },
    get brightness() { return state.brightness; },
    get performanceMode() { return state.performanceMode; },
    get renderPreset() { return state.renderPreset; },

    // ==========================================
    // State Setters (mocked for spying)
    // ==========================================

    setStreaming: createSetter('isStreaming'),
    setSelectedDeviceId: createSetter('selectedDeviceId'),
    setCinematicMode: createSetter('isCinematicModeEnabled'),
    setRecording: createSetter('isRecording'),
    setRecordingBlob: createSetter('recordingBlob'),
    setDeviceConnected: createSetter('deviceConnected'),
    setFullscreen: createSetter('isFullscreen'),
    setVolume: createSetter('volume'),
    setBrightness: createSetter('brightness'),
    setPerformanceMode: createSetter('performanceMode'),
    setRenderPreset: createSetter('renderPreset'),

    // ==========================================
    // Bulk Operations
    // ==========================================

    /**
     * Get current state snapshot
     */
    getSnapshot: vi.fn(() => ({ ...state })),

    /**
     * Update multiple state values
     */
    update: vi.fn((updates) => {
      Object.entries(updates).forEach(([key, value]) => {
        if (key in state && state[key] !== value) {
          const oldValue = state[key];
          state[key] = value;
          recordChange(key, oldValue, value);
        }
      });
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    /**
     * Get raw state object
     */
    _getState() {
      return { ...state };
    },

    /**
     * Get state change history
     */
    _getChangeHistory() {
      return [...changeHistory];
    },

    /**
     * Get changes for a specific key
     */
    _getChangesFor(key) {
      return changeHistory.filter(c => c.key === key);
    },

    /**
     * Check if a state key was changed
     */
    _wasChanged(key) {
      return changeHistory.some(c => c.key === key);
    },

    /**
     * Get the last change for a key
     */
    _getLastChangeFor(key) {
      for (let i = changeHistory.length - 1; i >= 0; i--) {
        if (changeHistory[i].key === key) {
          return changeHistory[i];
        }
      }
      return null;
    },

    /**
     * Clear change history
     */
    _clearHistory() {
      changeHistory.length = 0;
    },

    /**
     * Reset to initial state
     */
    _reset() {
      Object.assign(state, DEFAULT_STATE, initialState);
      changeHistory.length = 0;
      vi.clearAllMocks();
    },

    /**
     * Force set state (bypasses setters)
     */
    _forceSet(key, value) {
      state[key] = value;
    },
  };

  return appState;
}

/**
 * Creates AppState with streaming mode active
 */
export function createStreamingAppState(overrides = {}) {
  return createAppState({
    initialState: {
      isStreaming: true,
      deviceConnected: true,
      selectedDeviceId: 'chromatic-video-device',
      ...overrides,
    },
  });
}

export default createAppState;
