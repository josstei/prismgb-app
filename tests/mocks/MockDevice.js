/**
 * MockDevice - Simulates a Chromatic USB camera device
 *
 * Provides a complete mock of the Chromatic hardware for testing
 * streaming, device detection, and capture functionality.
 */

import { vi } from 'vitest';

/**
 * Chromatic device specifications
 */
export const CHROMATIC_SPECS = {
  vendorId: 0x374e,
  productId: 0x0101,
  name: 'Chromatic',
  nativeWidth: 160,
  nativeHeight: 144,
  frameRates: [30, 60],
  defaultFrameRate: 60,
};

/**
 * Creates a mock MediaStreamTrack that simulates Chromatic video
 */
export function createMockVideoTrack(options = {}) {
  const {
    width = CHROMATIC_SPECS.nativeWidth,
    height = CHROMATIC_SPECS.nativeHeight,
    frameRate = CHROMATIC_SPECS.defaultFrameRate,
    deviceId = 'mock-chromatic-device-id',
    label = 'Chromatic (Mock)',
  } = options;

  const track = {
    id: `mock-video-track-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    kind: 'video',
    label,
    enabled: true,
    muted: false,
    readyState: 'live',
    contentHint: '',
    _stopped: false,

    getSettings: vi.fn(() => ({
      deviceId,
      width,
      height,
      frameRate,
      aspectRatio: width / height,
      facingMode: 'environment',
      resizeMode: 'none',
    })),

    getCapabilities: vi.fn(() => ({
      deviceId,
      width: { min: width, max: width },
      height: { min: height, max: height },
      frameRate: { min: 30, max: 60 },
      aspectRatio: { min: width / height, max: width / height },
      facingMode: ['environment'],
      resizeMode: ['none', 'crop-and-scale'],
    })),

    getConstraints: vi.fn(() => ({
      deviceId: { exact: deviceId },
      width: { exact: width },
      height: { exact: height },
      frameRate: { ideal: frameRate },
    })),

    applyConstraints: vi.fn((constraints) => {
      return Promise.resolve();
    }),

    clone: vi.fn(function() {
      return createMockVideoTrack(options);
    }),

    stop: vi.fn(function() {
      this._stopped = true;
      this.readyState = 'ended';
      this.enabled = false;
    }),

    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };

  return track;
}

/**
 * Creates a mock MediaStream with Chromatic-like video
 */
export function createMockStream(options = {}) {
  const videoTrack = createMockVideoTrack(options);
  const tracks = [videoTrack];

  const stream = {
    id: `mock-stream-${Date.now()}`,
    active: true,
    _tracks: tracks,

    getTracks: vi.fn(() => [...tracks]),
    getVideoTracks: vi.fn(() => tracks.filter(t => t.kind === 'video')),
    getAudioTracks: vi.fn(() => tracks.filter(t => t.kind === 'audio')),

    addTrack: vi.fn((track) => {
      tracks.push(track);
    }),

    removeTrack: vi.fn((track) => {
      const index = tracks.indexOf(track);
      if (index > -1) tracks.splice(index, 1);
    }),

    clone: vi.fn(function() {
      return createMockStream(options);
    }),

    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  return stream;
}

/**
 * Creates a mock MediaDeviceInfo for the Chromatic
 */
export function createMockDeviceInfo(options = {}) {
  const {
    deviceId = 'mock-chromatic-device-id',
    label = 'Chromatic',
    groupId = 'mock-group-id',
  } = options;

  return {
    deviceId,
    kind: 'videoinput',
    label,
    groupId,
    toJSON: () => ({ deviceId, kind: 'videoinput', label, groupId }),
  };
}

/**
 * MockDevice class - Full device simulation
 */
export class MockDevice {
  constructor(options = {}) {
    this.specs = { ...CHROMATIC_SPECS, ...options };
    this.deviceInfo = createMockDeviceInfo({
      deviceId: options.deviceId || 'mock-chromatic-device-id',
      label: options.label || 'Chromatic',
    });
    this.isConnected = true;
    this.activeStream = null;
    this._frameCallbacks = [];
    this._frameInterval = null;
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    return this.deviceInfo;
  }

  /**
   * Connect the device (simulate USB connection)
   */
  connect() {
    this.isConnected = true;
    return this;
  }

  /**
   * Disconnect the device (simulate USB disconnection)
   */
  disconnect() {
    this.isConnected = false;
    this.stopStream();
    return this;
  }

  /**
   * Get a mock stream from this device
   */
  getStream(constraints = {}) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Device not connected'));
    }

    this.activeStream = createMockStream({
      width: this.specs.nativeWidth,
      height: this.specs.nativeHeight,
      frameRate: constraints.frameRate || this.specs.defaultFrameRate,
      deviceId: this.deviceInfo.deviceId,
      label: this.deviceInfo.label,
    });

    return Promise.resolve(this.activeStream);
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
  }

  /**
   * Start generating mock frames (for performance testing)
   */
  startFrameGeneration(callback, fps = 60) {
    this._stopFrameGeneration();
    const interval = 1000 / fps;

    this._frameInterval = setInterval(() => {
      const frameData = this._generateFrame();
      callback(frameData);
    }, interval);
  }

  /**
   * Stop frame generation
   */
  _stopFrameGeneration() {
    if (this._frameInterval) {
      clearInterval(this._frameInterval);
      this._frameInterval = null;
    }
  }

  /**
   * Generate a mock frame (ImageData-like)
   */
  _generateFrame() {
    const { nativeWidth, nativeHeight } = this.specs;
    const pixels = nativeWidth * nativeHeight * 4;

    return {
      width: nativeWidth,
      height: nativeHeight,
      data: new Uint8ClampedArray(pixels).fill(128), // Gray frame
      timestamp: performance.now(),
    };
  }

  /**
   * Get device capabilities
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
}

/**
 * MockDeviceManager - Manages multiple mock devices
 */
export class MockDeviceManager {
  constructor() {
    this.devices = new Map();
    this._deviceChangeListeners = [];
  }

  /**
   * Add a mock device
   */
  addDevice(device) {
    this.devices.set(device.deviceInfo.deviceId, device);
    this._notifyDeviceChange('deviceconnect', device);
    return this;
  }

  /**
   * Remove a mock device
   */
  removeDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.disconnect();
      this.devices.delete(deviceId);
      this._notifyDeviceChange('devicedisconnect', device);
    }
    return this;
  }

  /**
   * Get all connected devices
   */
  getDevices() {
    return Array.from(this.devices.values())
      .filter(d => d.isConnected)
      .map(d => d.getDeviceInfo());
  }

  /**
   * Find device by ID
   */
  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  /**
   * Setup navigator.mediaDevices mock
   */
  setupMediaDevicesMock() {
    const self = this;

    navigator.mediaDevices.enumerateDevices = vi.fn(async () => {
      return self.getDevices();
    });

    navigator.mediaDevices.getUserMedia = vi.fn(async (constraints) => {
      const videoConstraints = constraints.video;
      let deviceId = null;

      if (videoConstraints && typeof videoConstraints === 'object') {
        deviceId = videoConstraints.deviceId?.exact || videoConstraints.deviceId;
      }

      // Find matching device or use first available
      let device = deviceId
        ? self.devices.get(deviceId)
        : Array.from(self.devices.values()).find(d => d.isConnected);

      if (!device || !device.isConnected) {
        const error = new Error('Requested device not found');
        error.name = 'NotFoundError';
        throw error;
      }

      return device.getStream(videoConstraints);
    });

    navigator.mediaDevices.addEventListener = vi.fn((event, listener) => {
      if (event === 'devicechange') {
        self._deviceChangeListeners.push(listener);
      }
    });

    navigator.mediaDevices.removeEventListener = vi.fn((event, listener) => {
      if (event === 'devicechange') {
        const index = self._deviceChangeListeners.indexOf(listener);
        if (index > -1) self._deviceChangeListeners.splice(index, 1);
      }
    });

    return this;
  }

  /**
   * Notify device change listeners
   */
  _notifyDeviceChange(type, device) {
    this._deviceChangeListeners.forEach(listener => {
      listener({ type, device: device?.getDeviceInfo() });
    });
  }

  /**
   * Create a default Chromatic device
   */
  static createChromatic(options = {}) {
    return new MockDevice({
      ...CHROMATIC_SPECS,
      ...options,
    });
  }

  /**
   * Reset all mocks
   */
  reset() {
    this.devices.forEach(device => device.disconnect());
    this.devices.clear();
    this._deviceChangeListeners = [];
    return this;
  }
}

// Default instance for convenience
export const mockDeviceManager = new MockDeviceManager();
