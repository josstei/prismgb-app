/**
 * MockDevice State Machine
 *
 * Enhanced MockDevice with finite state machine for realistic device simulation.
 * Models real device state transitions for accurate testing.
 */

import { vi } from 'vitest';
import { CHROMATIC_SPECS, createMockStream, createMockDeviceInfo } from './mock-device.factory.js';

/**
 * Device states
 */
export const DeviceState = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTED: 'connected',
  PERMISSION_PENDING: 'permission_pending',
  PERMISSION_DENIED: 'permission_denied',
  STREAMING: 'streaming',
  ERROR: 'error',
});

/**
 * Valid state transitions
 */
const STATE_TRANSITIONS = Object.freeze({
  [DeviceState.DISCONNECTED]: [
    DeviceState.CONNECTED,
  ],
  [DeviceState.CONNECTED]: [
    DeviceState.PERMISSION_PENDING,
    DeviceState.DISCONNECTED,
    DeviceState.ERROR,
  ],
  [DeviceState.PERMISSION_PENDING]: [
    DeviceState.STREAMING,
    DeviceState.PERMISSION_DENIED,
    DeviceState.DISCONNECTED,
    DeviceState.ERROR,
  ],
  [DeviceState.PERMISSION_DENIED]: [
    DeviceState.PERMISSION_PENDING, // Retry
    DeviceState.DISCONNECTED,
  ],
  [DeviceState.STREAMING]: [
    DeviceState.CONNECTED,     // Stop streaming
    DeviceState.DISCONNECTED,  // Unexpected disconnect
    DeviceState.ERROR,         // Stream error
  ],
  [DeviceState.ERROR]: [
    DeviceState.CONNECTED,     // Recovery
    DeviceState.DISCONNECTED,
  ],
});

/**
 * State event names for each transition
 */
const TRANSITION_EVENTS = Object.freeze({
  [`${DeviceState.DISCONNECTED}->${DeviceState.CONNECTED}`]: 'device:connected',
  [`${DeviceState.CONNECTED}->${DeviceState.DISCONNECTED}`]: 'device:disconnected',
  [`${DeviceState.CONNECTED}->${DeviceState.PERMISSION_PENDING}`]: 'device:permission-requested',
  [`${DeviceState.PERMISSION_PENDING}->${DeviceState.STREAMING}`]: 'device:streaming-started',
  [`${DeviceState.PERMISSION_PENDING}->${DeviceState.PERMISSION_DENIED}`]: 'device:permission-denied',
  [`${DeviceState.STREAMING}->${DeviceState.CONNECTED}`]: 'device:streaming-stopped',
  [`${DeviceState.STREAMING}->${DeviceState.DISCONNECTED}`]: 'device:disconnected-while-streaming',
  [`${DeviceState.STREAMING}->${DeviceState.ERROR}`]: 'device:stream-error',
  [`${DeviceState.ERROR}->${DeviceState.CONNECTED}`]: 'device:recovered',
});

/**
 * MockDeviceStateMachine - Device simulation with state machine
 */
export class MockDeviceStateMachine {
  #state = DeviceState.DISCONNECTED;
  #stateHistory = [];
  #eventListeners = new Map();
  #permissionState = 'prompt'; // 'prompt' | 'granted' | 'denied'
  #simulatedLatency = 0;
  #shouldFailNextOperation = false;
  #failureReason = null;

  constructor(options = {}) {
    this.specs = { ...CHROMATIC_SPECS, ...options };
    this.deviceInfo = createMockDeviceInfo({
      deviceId: options.deviceId || 'mock-chromatic-fsm',
      label: options.label || 'Chromatic',
    });
    this.activeStream = null;
    this._frameCallbacks = [];
    this._frameInterval = null;
  }

  // ==========================================
  // State Machine Core
  // ==========================================

  /**
   * Get current state
   */
  get state() {
    return this.#state;
  }

  /**
   * Get state history
   */
  get stateHistory() {
    return [...this.#stateHistory];
  }

  /**
   * Check if a transition is valid
   */
  canTransitionTo(newState) {
    const validTransitions = STATE_TRANSITIONS[this.#state];
    return validTransitions?.includes(newState) ?? false;
  }

  /**
   * Transition to a new state
   * @throws {Error} If transition is invalid
   */
  #transition(newState, metadata = {}) {
    if (!this.canTransitionTo(newState)) {
      throw new Error(
        `Invalid state transition: ${this.#state} -> ${newState}. ` +
        `Valid transitions from ${this.#state}: ${STATE_TRANSITIONS[this.#state]?.join(', ') || 'none'}`
      );
    }

    const oldState = this.#state;
    const transitionKey = `${oldState}->${newState}`;
    const eventName = TRANSITION_EVENTS[transitionKey];

    this.#stateHistory.push({
      from: oldState,
      to: newState,
      timestamp: Date.now(),
      metadata,
    });

    this.#state = newState;

    // Emit transition event
    if (eventName) {
      this.#emit(eventName, { oldState, newState, ...metadata });
    }

    // Always emit generic state change
    this.#emit('statechange', { oldState, newState, ...metadata });

    return this;
  }

  // ==========================================
  // Event System
  // ==========================================

  /**
   * Add event listener
   */
  on(event, callback) {
    if (!this.#eventListeners.has(event)) {
      this.#eventListeners.set(event, []);
    }
    this.#eventListeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event, callback) {
    const listeners = this.#eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) listeners.splice(index, 1);
    }
  }

  /**
   * Emit event
   */
  #emit(event, data) {
    const listeners = this.#eventListeners.get(event) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (e) {
        // Ignore listener errors
      }
    });
  }

  // ==========================================
  // Device Operations
  // ==========================================

  /**
   * Connect the device
   */
  async connect() {
    await this.#delay();

    if (this.#shouldFail('connect')) {
      this.#transition(DeviceState.ERROR, { reason: this.#failureReason });
      throw new Error(this.#failureReason || 'Connection failed');
    }

    if (this.#state === DeviceState.DISCONNECTED) {
      this.#transition(DeviceState.CONNECTED);
    }

    return this;
  }

  /**
   * Disconnect the device
   */
  disconnect() {
    this.stopStream();

    if (this.#state !== DeviceState.DISCONNECTED) {
      this.#transition(DeviceState.DISCONNECTED, {
        wasStreaming: this.activeStream !== null,
      });
    }

    return this;
  }

  /**
   * Request stream (handles permission flow)
   */
  async getStream(constraints = {}) {
    await this.#delay();

    if (this.#state !== DeviceState.CONNECTED && this.#state !== DeviceState.STREAMING) {
      throw new Error(`Cannot get stream from state: ${this.#state}`);
    }

    // Start permission request
    this.#transition(DeviceState.PERMISSION_PENDING);

    await this.#delay(); // Simulate permission dialog

    if (this.#shouldFail('getStream')) {
      this.#transition(DeviceState.ERROR, { reason: this.#failureReason });
      throw new Error(this.#failureReason || 'Stream acquisition failed');
    }

    // Check permission state
    if (this.#permissionState === 'denied') {
      this.#transition(DeviceState.PERMISSION_DENIED);
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      throw error;
    }

    // Grant permission and start streaming
    this.#permissionState = 'granted';
    this.#transition(DeviceState.STREAMING);

    this.activeStream = createMockStream({
      width: this.specs.nativeWidth,
      height: this.specs.nativeHeight,
      frameRate: constraints.frameRate || this.specs.defaultFrameRate,
      deviceId: this.deviceInfo.deviceId,
      label: this.deviceInfo.label,
    });

    return this.activeStream;
  }

  /**
   * Stop the active stream
   */
  stopStream() {
    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }

    this._stopFrameGeneration();

    if (this.#state === DeviceState.STREAMING) {
      this.#transition(DeviceState.CONNECTED);
    }

    return this;
  }

  /**
   * Simulate stream error during streaming
   */
  simulateStreamError(reason = 'Stream lost') {
    if (this.#state !== DeviceState.STREAMING) {
      throw new Error('Cannot simulate stream error when not streaming');
    }

    this.stopStream();
    this.#transition(DeviceState.ERROR, { reason });
    this.#emit('error', { reason });
  }

  /**
   * Simulate unexpected disconnection
   */
  simulateUnexpectedDisconnect() {
    const wasStreaming = this.#state === DeviceState.STREAMING;

    if (this.activeStream) {
      this.activeStream.getTracks().forEach(track => track.stop());
      this.activeStream = null;
    }

    this._stopFrameGeneration();

    if (this.#state !== DeviceState.DISCONNECTED) {
      this.#transition(DeviceState.DISCONNECTED, { unexpected: true, wasStreaming });
    }
  }

  /**
   * Recover from error state
   */
  async recover() {
    if (this.#state !== DeviceState.ERROR) {
      throw new Error('Cannot recover when not in error state');
    }

    await this.#delay();
    this.#transition(DeviceState.CONNECTED, { recovered: true });
    return this;
  }

  // ==========================================
  // Test Control Methods
  // ==========================================

  /**
   * Set simulated latency for operations
   */
  setLatency(ms) {
    this.#simulatedLatency = ms;
    return this;
  }

  /**
   * Make next operation fail
   */
  failNextOperation(reason = 'Simulated failure') {
    this.#shouldFailNextOperation = true;
    this.#failureReason = reason;
    return this;
  }

  /**
   * Set permission state
   */
  setPermissionState(state) {
    if (!['prompt', 'granted', 'denied'].includes(state)) {
      throw new Error(`Invalid permission state: ${state}`);
    }
    this.#permissionState = state;
    return this;
  }

  /**
   * Force state (for setup, bypasses validation)
   */
  _forceState(state) {
    this.#stateHistory.push({
      from: this.#state,
      to: state,
      timestamp: Date.now(),
      forced: true,
    });
    this.#state = state;
    return this;
  }

  /**
   * Reset device to initial state
   */
  reset() {
    this.disconnect();
    this.#state = DeviceState.DISCONNECTED;
    this.#stateHistory.length = 0;
    this.#eventListeners.clear();
    this.#permissionState = 'prompt';
    this.#simulatedLatency = 0;
    this.#shouldFailNextOperation = false;
    this.#failureReason = null;
    return this;
  }

  // ==========================================
  // Helpers
  // ==========================================

  async #delay() {
    if (this.#simulatedLatency > 0) {
      await new Promise(r => setTimeout(r, this.#simulatedLatency));
    }
  }

  #shouldFail(operation) {
    if (this.#shouldFailNextOperation) {
      this.#shouldFailNextOperation = false;
      return true;
    }
    return false;
  }

  /**
   * Start frame generation (for performance testing)
   */
  startFrameGeneration(callback, fps = 60) {
    this._stopFrameGeneration();
    const interval = 1000 / fps;

    this._frameInterval = setInterval(() => {
      callback(this._generateFrame());
    }, interval);
  }

  _stopFrameGeneration() {
    if (this._frameInterval) {
      clearInterval(this._frameInterval);
      this._frameInterval = null;
    }
  }

  _generateFrame() {
    const { nativeWidth, nativeHeight } = this.specs;
    const pixels = nativeWidth * nativeHeight * 4;

    return {
      width: nativeWidth,
      height: nativeHeight,
      data: new Uint8ClampedArray(pixels).fill(128),
      timestamp: performance.now(),
    };
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    return this.deviceInfo;
  }

  /**
   * Get capabilities
   */
  getCapabilities() {
    return {
      nativeResolution: {
        width: this.specs.nativeWidth,
        height: this.specs.nativeHeight,
      },
      supportedFrameRates: this.specs.frameRates,
      canvasScale: 4,
      deviceName: this.specs.name,
    };
  }

  /**
   * Check if connected
   */
  get isConnected() {
    return this.#state !== DeviceState.DISCONNECTED;
  }

  /**
   * Check if streaming
   */
  get isStreaming() {
    return this.#state === DeviceState.STREAMING;
  }
}

/**
 * Creates a Chromatic device with state machine
 */
export function createChromaticWithFSM(options = {}) {
  return new MockDeviceStateMachine({
    ...CHROMATIC_SPECS,
    ...options,
  });
}

export default MockDeviceStateMachine;
