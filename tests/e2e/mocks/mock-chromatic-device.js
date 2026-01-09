/**
 * MockChromaticDevice - Complete E2E mock for the Chromatic device
 *
 * Simulates:
 * - Device USB connection/disconnection events via deviceAPI
 * - Video stream (160x144 @ 60fps) via navigator.mediaDevices
 * - Audio stream (48kHz stereo, no processing)
 *
 * Works at the preload/renderer level to intercept IPC and MediaDevices.
 */

/**
 * Chromatic device specifications - matches device-chromatic.config.js
 */
export const CHROMATIC_SPECS = {
  // USB identifiers
  vendorId: 0x374e, // 14158 decimal
  productId: 0x0101, // 257 decimal

  // Display
  nativeWidth: 160,
  nativeHeight: 144,
  aspectRatio: 160 / 144,

  // Frame rates
  defaultFrameRate: 60,
  supportedFrameRates: [30, 60],

  // Audio
  audioSampleRate: 48000,
  audioChannels: 2,

  // Device identification
  deviceId: 'mock-chromatic-video-device',
  audioDeviceId: 'mock-chromatic-audio-device',
  groupId: 'mock-chromatic-group',
  label: 'Chromatic',

  // Label patterns for detection
  labelPatterns: ['chromatic', 'modretro', 'mod retro', '374e:0101'],
};

/**
 * Test pattern types for video generation
 */
export const TestPatterns = {
  SOLID_GRAY: 'solid-gray',
  COLOR_BARS: 'color-bars',
  CHECKERBOARD: 'checkerboard',
  GRADIENT: 'gradient',
  ANIMATED: 'animated',
  FRAME_COUNTER: 'frame-counter',
};

/**
 * MockChromaticDevice class
 *
 * Creates a fully functional mock of the Chromatic device for E2E testing.
 * Generates real MediaStreams from canvas/AudioContext that can be used
 * by the streaming pipeline.
 */
export class MockChromaticDevice {
  constructor(options = {}) {
    this.specs = { ...CHROMATIC_SPECS, ...options };
    this.isConnected = false;
    this.activeStream = null;
    this.videoCanvas = null;
    this.audioContext = null;
    this.animationFrameId = null;
    this.frameCount = 0;
    this.testPattern = options.testPattern || TestPatterns.COLOR_BARS;

    // Callbacks for connection events
    this._onConnectCallbacks = [];
    this._onDisconnectCallbacks = [];
  }

  /**
   * Get device info matching MediaDeviceInfo interface
   */
  getVideoDeviceInfo() {
    return {
      deviceId: this.specs.deviceId,
      groupId: this.specs.groupId,
      kind: 'videoinput',
      label: this.specs.label,
      toJSON: () => ({
        deviceId: this.specs.deviceId,
        groupId: this.specs.groupId,
        kind: 'videoinput',
        label: this.specs.label,
      }),
    };
  }

  /**
   * Get audio device info matching MediaDeviceInfo interface
   */
  getAudioDeviceInfo() {
    return {
      deviceId: this.specs.audioDeviceId,
      groupId: this.specs.groupId,
      kind: 'audioinput',
      label: `${this.specs.label} Audio`,
      toJSON: () => ({
        deviceId: this.specs.audioDeviceId,
        groupId: this.specs.groupId,
        kind: 'audioinput',
        label: `${this.specs.label} Audio`,
      }),
    };
  }

  /**
   * Get USB device info for IPC events
   */
  getUSBDeviceInfo() {
    return {
      vendorId: this.specs.vendorId,
      productId: this.specs.productId,
      deviceName: this.specs.label,
      serialNumber: 'MOCK-001',
      configName: 'Mod Retro Chromatic',
    };
  }

  /**
   * Create a mock video track from canvas
   */
  _createVideoTrack() {
    const { nativeWidth, nativeHeight, defaultFrameRate } = this.specs;

    // Create canvas for video generation
    this.videoCanvas = document.createElement('canvas');
    this.videoCanvas.width = nativeWidth;
    this.videoCanvas.height = nativeHeight;
    const ctx = this.videoCanvas.getContext('2d');

    // Start rendering test pattern
    this._startVideoRendering(ctx);

    // Create MediaStream from canvas
    const stream = this.videoCanvas.captureStream(defaultFrameRate);
    const videoTrack = stream.getVideoTracks()[0];

    // Enhance track with Chromatic-like settings
    const originalGetSettings = videoTrack.getSettings.bind(videoTrack);
    videoTrack.getSettings = () => ({
      ...originalGetSettings(),
      deviceId: this.specs.deviceId,
      groupId: this.specs.groupId,
      width: nativeWidth,
      height: nativeHeight,
      frameRate: defaultFrameRate,
      aspectRatio: nativeWidth / nativeHeight,
      facingMode: 'environment',
      resizeMode: 'none',
    });

    // Add label property
    Object.defineProperty(videoTrack, 'label', {
      value: this.specs.label,
      writable: false,
    });

    return videoTrack;
  }

  /**
   * Start rendering video frames based on test pattern
   */
  _startVideoRendering(ctx) {
    const { nativeWidth, nativeHeight } = this.specs;

    const render = () => {
      this.frameCount++;

      switch (this.testPattern) {
        case TestPatterns.SOLID_GRAY:
          this._renderSolidGray(ctx, nativeWidth, nativeHeight);
          break;
        case TestPatterns.COLOR_BARS:
          this._renderColorBars(ctx, nativeWidth, nativeHeight);
          break;
        case TestPatterns.CHECKERBOARD:
          this._renderCheckerboard(ctx, nativeWidth, nativeHeight);
          break;
        case TestPatterns.GRADIENT:
          this._renderGradient(ctx, nativeWidth, nativeHeight);
          break;
        case TestPatterns.ANIMATED:
          this._renderAnimated(ctx, nativeWidth, nativeHeight);
          break;
        case TestPatterns.FRAME_COUNTER:
          this._renderFrameCounter(ctx, nativeWidth, nativeHeight);
          break;
        default:
          this._renderColorBars(ctx, nativeWidth, nativeHeight);
      }

      this.animationFrameId = requestAnimationFrame(render);
    };

    this.animationFrameId = requestAnimationFrame(render);
  }

  /**
   * Render solid gray pattern
   */
  _renderSolidGray(ctx, width, height) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Render color bars pattern (SMPTE-like)
   */
  _renderColorBars(ctx, width, height) {
    const colors = [
      '#ffffff',
      '#ffff00',
      '#00ffff',
      '#00ff00',
      '#ff00ff',
      '#ff0000',
      '#0000ff',
      '#000000',
    ];
    const barWidth = width / colors.length;

    colors.forEach((color, i) => {
      ctx.fillStyle = color;
      ctx.fillRect(i * barWidth, 0, barWidth, height);
    });
  }

  /**
   * Render checkerboard pattern
   */
  _renderCheckerboard(ctx, width, height) {
    const cellSize = 16;
    for (let y = 0; y < height; y += cellSize) {
      for (let x = 0; x < width; x += cellSize) {
        const isLight = (x / cellSize + y / cellSize) % 2 === 0;
        ctx.fillStyle = isLight ? '#ffffff' : '#000000';
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }

  /**
   * Render gradient pattern
   */
  _renderGradient(ctx, width, height) {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(0.5, '#16213e');
    gradient.addColorStop(1, '#0f3460');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Render animated pattern (moving bar)
   */
  _renderAnimated(ctx, width, height) {
    // Background
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, width, height);

    // Moving bar
    const barWidth = 20;
    const x = (this.frameCount * 2) % (width + barWidth) - barWidth;
    ctx.fillStyle = '#48bb78';
    ctx.fillRect(x, 0, barWidth, height);
  }

  /**
   * Render frame counter pattern
   */
  _renderFrameCounter(ctx, width, height) {
    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Frame counter text
    ctx.fillStyle = '#48bb78';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`F:${this.frameCount}`, width / 2, height / 2);

    // FPS indicator
    ctx.font = '8px monospace';
    ctx.fillText(`${this.specs.defaultFrameRate}fps`, width / 2, height / 2 + 20);
  }

  /**
   * Create a mock audio track
   */
  _createAudioTrack() {
    const { audioSampleRate, audioChannels } = this.specs;

    // Create AudioContext for audio generation
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: audioSampleRate,
    });

    // Create oscillator for test tone (or silence)
    const oscillator = this.audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = 440; // A4 note - for testing

    // Create gain node to control volume (set to 0 for silence by default)
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // Silent by default

    // Create media stream destination
    const destination = this.audioContext.createMediaStreamDestination();

    // Connect: oscillator -> gain -> destination
    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start();

    // Store references for cleanup
    this._oscillator = oscillator;
    this._gainNode = gainNode;
    this._audioDestination = destination;

    const audioTrack = destination.stream.getAudioTracks()[0];

    // Enhance track with settings
    const originalGetSettings = audioTrack.getSettings.bind(audioTrack);
    audioTrack.getSettings = () => ({
      ...originalGetSettings(),
      deviceId: this.specs.audioDeviceId,
      groupId: this.specs.groupId,
      sampleRate: audioSampleRate,
      channelCount: audioChannels,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });

    // Add label property
    Object.defineProperty(audioTrack, 'label', {
      value: `${this.specs.label} Audio`,
      writable: false,
    });

    return audioTrack;
  }

  /**
   * Set audio volume (0 = silent, 1 = full)
   */
  setAudioVolume(volume) {
    if (this._gainNode) {
      this._gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Set audio frequency for test tone
   */
  setAudioFrequency(frequency) {
    if (this._oscillator) {
      this._oscillator.frequency.value = frequency;
    }
  }

  /**
   * Get a mock MediaStream combining video and audio
   */
  getStream(options = {}) {
    if (!this.isConnected) {
      return Promise.reject(new Error('Device not connected'));
    }

    const includeVideo = options.video !== false;
    const includeAudio = options.audio !== false;

    const tracks = [];

    if (includeVideo) {
      tracks.push(this._createVideoTrack());
    }

    if (includeAudio) {
      tracks.push(this._createAudioTrack());
    }

    this.activeStream = new MediaStream(tracks);

    return Promise.resolve(this.activeStream);
  }

  /**
   * Stop the active stream and clean up resources
   */
  stopStream() {
    // Stop animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Stop all tracks
    if (this.activeStream) {
      this.activeStream.getTracks().forEach((track) => track.stop());
      this.activeStream = null;
    }

    // Clean up audio context
    if (this._oscillator) {
      this._oscillator.stop();
      this._oscillator.disconnect();
      this._oscillator = null;
    }

    if (this._gainNode) {
      this._gainNode.disconnect();
      this._gainNode = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    // Clean up video canvas
    this.videoCanvas = null;
    this.frameCount = 0;
  }

  /**
   * Simulate device connection
   */
  connect() {
    if (this.isConnected) {
      return this;
    }

    this.isConnected = true;

    // Notify all connection callbacks
    const deviceInfo = this.getUSBDeviceInfo();
    this._onConnectCallbacks.forEach((cb) => cb(deviceInfo));

    return this;
  }

  /**
   * Simulate device disconnection
   */
  disconnect() {
    if (!this.isConnected) {
      return this;
    }

    this.stopStream();
    this.isConnected = false;

    // Notify all disconnection callbacks
    this._onDisconnectCallbacks.forEach((cb) => cb());

    return this;
  }

  /**
   * Register connection callback
   */
  onConnect(callback) {
    this._onConnectCallbacks.push(callback);
    return () => {
      const index = this._onConnectCallbacks.indexOf(callback);
      if (index > -1) this._onConnectCallbacks.splice(index, 1);
    };
  }

  /**
   * Register disconnection callback
   */
  onDisconnect(callback) {
    this._onDisconnectCallbacks.push(callback);
    return () => {
      const index = this._onDisconnectCallbacks.indexOf(callback);
      if (index > -1) this._onDisconnectCallbacks.splice(index, 1);
    };
  }

  /**
   * Get device capabilities (matches adapter interface)
   */
  getCapabilities() {
    return {
      nativeResolution: {
        width: this.specs.nativeWidth,
        height: this.specs.nativeHeight,
      },
      supportedFrameRates: this.specs.supportedFrameRates,
      defaultFrameRate: this.specs.defaultFrameRate,
      audioSupport: true,
      canvasScale: 4,
      pixelPerfect: true,
      deviceName: this.specs.label,
    };
  }

  /**
   * Set test pattern dynamically
   */
  setTestPattern(pattern) {
    this.testPattern = pattern;
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.disconnect();
    this._onConnectCallbacks = [];
    this._onDisconnectCallbacks = [];
  }
}
