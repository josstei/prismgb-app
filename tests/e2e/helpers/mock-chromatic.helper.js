/**
 * E2E Mock Chromatic Helpers
 *
 * Provides high-level helpers to inject mock Chromatic device into E2E tests.
 * Designed for Playwright Electron testing.
 *
 * Two-pronged approach:
 * 1. IPC injection via main process (injectDeviceConnectedEvent) - triggers real deviceAPI callbacks
 * 2. MediaDevices mock (injectMockChromaticDevice) - provides mock video/audio streams
 *
 * For full UI testing, use both together:
 * - Inject MediaDevices mock first (for stream availability)
 * - Then inject IPC event (triggers device connected UI state)
 */

import { CHROMATIC_SPECS } from '../../support/chromatic-device-specs.js';
export { CHROMATIC_SPECS };

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
 * Inject mock device infrastructure into the Electron renderer
 *
 * @param {import('@playwright/test').Page} page - Playwright page/window
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Controller object for test manipulation
 */
export async function injectMockChromaticDevice(page, options = {}) {
  const { autoConnect = false, testPattern = 'color-bars', includeAudio = true } = options;

  // Inject the mock infrastructure into the page
  await page.evaluate(
    ({ specs, testPattern, includeAudio }) => {
      // Store mock state on window for test access
      window.__mockChromaticState = {
        isConnected: false,
        deviceInfo: null,
        testPattern,
        includeAudio,
        specs,
        deviceChangeListeners: [],
        _activeVideoStream: null,
        _activeAudioStream: null,
      };

      const state = window.__mockChromaticState;

      // === Note on deviceAPI ===
      // The deviceAPI is exposed via contextBridge.exposeInMainWorld which creates
      // non-configurable properties that cannot be replaced from the renderer context.
      // For E2E tests, we focus on mocking navigator.mediaDevices which CAN be replaced.
      // The mock state is stored on window.__mockChromaticState for tests to access.

      // === Mock MediaDevices ===
      const originalEnumerateDevices =
        navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
      const originalGetUserMedia =
        navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const originalAddEventListener =
        navigator.mediaDevices.addEventListener.bind(navigator.mediaDevices);
      const originalRemoveEventListener =
        navigator.mediaDevices.removeEventListener.bind(navigator.mediaDevices);

      // Helper to create video canvas stream
      function createMockVideoStream() {
        const canvas = document.createElement('canvas');
        canvas.width = specs.nativeWidth;
        canvas.height = specs.nativeHeight;
        const ctx = canvas.getContext('2d');

        let frameCount = 0;
        let animationId = null;

        function renderFrame() {
          frameCount++;

          // Draw test pattern based on type
          switch (state.testPattern) {
            case 'solid-gray':
              ctx.fillStyle = '#808080';
              ctx.fillRect(0, 0, specs.nativeWidth, specs.nativeHeight);
              break;

            case 'color-bars': {
              const colors = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f', '#000'];
              const barWidth = specs.nativeWidth / colors.length;
              colors.forEach((c, i) => {
                ctx.fillStyle = c;
                ctx.fillRect(i * barWidth, 0, barWidth, specs.nativeHeight);
              });
              break;
            }

            case 'frame-counter':
              ctx.fillStyle = '#1a1a2e';
              ctx.fillRect(0, 0, specs.nativeWidth, specs.nativeHeight);
              ctx.fillStyle = '#48bb78';
              ctx.font = 'bold 16px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`F:${frameCount}`, specs.nativeWidth / 2, specs.nativeHeight / 2);
              break;

            case 'animated': {
              ctx.fillStyle = '#0f0f1e';
              ctx.fillRect(0, 0, specs.nativeWidth, specs.nativeHeight);
              const x = (frameCount * 2) % (specs.nativeWidth + 20) - 20;
              ctx.fillStyle = '#48bb78';
              ctx.fillRect(x, 0, 20, specs.nativeHeight);
              break;
            }

            case 'checkerboard': {
              const cellSize = 16;
              for (let y = 0; y < specs.nativeHeight; y += cellSize) {
                for (let x = 0; x < specs.nativeWidth; x += cellSize) {
                  const isLight = (x / cellSize + y / cellSize) % 2 === 0;
                  ctx.fillStyle = isLight ? '#ffffff' : '#000000';
                  ctx.fillRect(x, y, cellSize, cellSize);
                }
              }
              break;
            }

            default:
              ctx.fillStyle = '#4a5568';
              ctx.fillRect(0, 0, specs.nativeWidth, specs.nativeHeight);
          }

          animationId = requestAnimationFrame(renderFrame);
        }

        renderFrame();

        const stream = canvas.captureStream(specs.defaultFrameRate);

        // Store for cleanup
        stream.__mockCanvas = canvas;
        stream.__mockAnimationId = animationId;
        stream.__mockCleanup = () => {
          if (animationId) cancelAnimationFrame(animationId);
        };

        // Enhance video track settings
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const originalGetSettings = videoTrack.getSettings.bind(videoTrack);
          videoTrack.getSettings = () => ({
            ...originalGetSettings(),
            deviceId: specs.deviceId,
            groupId: specs.groupId,
            width: specs.nativeWidth,
            height: specs.nativeHeight,
            frameRate: specs.defaultFrameRate,
          });
        }

        return stream;
      }

      // Helper to create audio stream
      function createMockAudioStream() {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: specs.audioSampleRate,
        });

        const oscillator = audioCtx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.value = 440;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = 0; // Silent by default

        const destination = audioCtx.createMediaStreamDestination();

        oscillator.connect(gainNode);
        gainNode.connect(destination);
        oscillator.start();

        const stream = destination.stream;

        // Store for cleanup
        stream.__mockAudioCtx = audioCtx;
        stream.__mockOscillator = oscillator;
        stream.__mockGainNode = gainNode;
        stream.__mockCleanup = () => {
          oscillator.stop();
          oscillator.disconnect();
          gainNode.disconnect();
          audioCtx.close();
        };

        // Enhance audio track settings
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          const originalGetSettings = audioTrack.getSettings.bind(audioTrack);
          audioTrack.getSettings = () => ({
            ...originalGetSettings(),
            deviceId: specs.audioDeviceId,
            groupId: specs.groupId,
            sampleRate: specs.audioSampleRate,
            channelCount: specs.audioChannels,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          });
        }

        return stream;
      }

      // Override enumerateDevices
      navigator.mediaDevices.enumerateDevices = async () => {
        const devices = [];

        if (state.isConnected) {
          devices.push({
            deviceId: specs.deviceId,
            groupId: specs.groupId,
            kind: 'videoinput',
            label: specs.label,
            toJSON() {
              return this;
            },
          });

          if (state.includeAudio) {
            devices.push({
              deviceId: specs.audioDeviceId,
              groupId: specs.groupId,
              kind: 'audioinput',
              label: `${specs.label} Audio`,
              toJSON() {
                return this;
              },
            });
          }
        }

        return devices;
      };

      // Override getUserMedia
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        if (!state.isConnected) {
          const error = new Error('Requested device not found');
          error.name = 'NotFoundError';
          throw error;
        }

        const tracks = [];

        if (constraints.video) {
          const videoStream = createMockVideoStream();
          videoStream.getVideoTracks().forEach((t) => tracks.push(t));
          state._activeVideoStream = videoStream;
        }

        if (constraints.audio && state.includeAudio) {
          const audioStream = createMockAudioStream();
          audioStream.getAudioTracks().forEach((t) => tracks.push(t));
          state._activeAudioStream = audioStream;
        }

        return new MediaStream(tracks);
      };

      // Override addEventListener
      navigator.mediaDevices.addEventListener = (type, listener, options) => {
        if (type === 'devicechange') {
          state.deviceChangeListeners.push(listener);
        }
        return originalAddEventListener(type, listener, options);
      };

      // Override removeEventListener
      navigator.mediaDevices.removeEventListener = (type, listener, options) => {
        if (type === 'devicechange') {
          const idx = state.deviceChangeListeners.indexOf(listener);
          if (idx > -1) state.deviceChangeListeners.splice(idx, 1);
        }
        return originalRemoveEventListener(type, listener, options);
      };

      // Store originals for restoration (note: deviceAPI cannot be mocked due to contextBridge)
      window.__mockChromaticState.__originals = {
        enumerateDevices: originalEnumerateDevices,
        getUserMedia: originalGetUserMedia,
        addEventListener: originalAddEventListener,
        removeEventListener: originalRemoveEventListener,
      };
    },
    { specs: CHROMATIC_SPECS, testPattern, includeAudio }
  );

  // If autoConnect, simulate connection
  if (autoConnect) {
    await simulateDeviceConnect(page);
  }

  // Return controller object
  return {
    connect: () => simulateDeviceConnect(page),
    disconnect: () => simulateDeviceDisconnect(page),
    setTestPattern: (pattern) => setMockTestPattern(page, pattern),
    cleanup: () => cleanupMockDevice(page),
    getStatus: () => getMockDeviceStatus(page),
  };
}

/**
 * Simulate device connection
 */
export async function simulateDeviceConnect(page) {
  await page.evaluate(() => {
    const state = window.__mockChromaticState;
    if (!state) {
      console.error('Mock device not injected');
      return;
    }

    const specs = state.specs;

    state.isConnected = true;
    state.deviceInfo = {
      vendorId: specs.vendorId,
      productId: specs.productId,
      deviceName: specs.label,
      configName: specs.configName,
      serialNumber: 'MOCK-001',
    };

    // Trigger devicechange event
    const event = new Event('devicechange');
    state.deviceChangeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error(e);
      }
    });
    navigator.mediaDevices.dispatchEvent(event);
  });
}

/**
 * Simulate device disconnection
 */
export async function simulateDeviceDisconnect(page) {
  await page.evaluate(() => {
    const state = window.__mockChromaticState;
    if (!state) return;

    // Cleanup active streams
    if (state._activeVideoStream?.__mockCleanup) {
      state._activeVideoStream.__mockCleanup();
    }
    if (state._activeAudioStream?.__mockCleanup) {
      state._activeAudioStream.__mockCleanup();
    }

    state.isConnected = false;
    state.deviceInfo = null;
    state._activeVideoStream = null;
    state._activeAudioStream = null;

    // Trigger devicechange event
    const event = new Event('devicechange');
    state.deviceChangeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (e) {
        console.error(e);
      }
    });
    navigator.mediaDevices.dispatchEvent(event);
  });
}

/**
 * Set test pattern dynamically
 */
export async function setMockTestPattern(page, pattern) {
  await page.evaluate((p) => {
    if (window.__mockChromaticState) {
      window.__mockChromaticState.testPattern = p;
    }
  }, pattern);
}

/**
 * Get mock device status
 */
export async function getMockDeviceStatus(page) {
  return page.evaluate(() => {
    const state = window.__mockChromaticState;
    if (!state) {
      return { injected: false, isConnected: false };
    }
    return {
      injected: true,
      isConnected: state.isConnected,
      deviceInfo: state.deviceInfo,
      testPattern: state.testPattern,
      includeAudio: state.includeAudio,
    };
  });
}

/**
 * Clean up mock device and restore original APIs
 */
export async function cleanupMockDevice(page) {
  await page.evaluate(() => {
    const state = window.__mockChromaticState;
    if (!state) return;

    // Cleanup active streams
    if (state._activeVideoStream?.__mockCleanup) {
      state._activeVideoStream.__mockCleanup();
    }
    if (state._activeAudioStream?.__mockCleanup) {
      state._activeAudioStream.__mockCleanup();
    }

    // Restore original APIs (note: deviceAPI cannot be mocked due to contextBridge)
    const originals = state.__originals;
    if (originals) {
      if (originals.enumerateDevices) {
        navigator.mediaDevices.enumerateDevices = originals.enumerateDevices;
      }
      if (originals.getUserMedia) {
        navigator.mediaDevices.getUserMedia = originals.getUserMedia;
      }
      if (originals.addEventListener) {
        navigator.mediaDevices.addEventListener = originals.addEventListener;
      }
      if (originals.removeEventListener) {
        navigator.mediaDevices.removeEventListener = originals.removeEventListener;
      }
    }

    delete window.__mockChromaticState;
  });
}

/**
 * Wait for device status indicator to show specific state
 */
export async function waitForDeviceIndicator(page, expectedState, options = {}) {
  const { timeout = 5000 } = options;

  if (expectedState === 'connected') {
    await page.waitForSelector('#statusIndicator.connected', {
      timeout,
      state: 'attached',
    });
  } else {
    // Wait for NOT connected
    await page.waitForFunction(
      () => {
        const indicator = document.getElementById('statusIndicator');
        return indicator && !indicator.classList.contains('connected');
      },
      { timeout }
    );
  }
}

/**
 * Check if stream is active (canvas has rendered content)
 */
export async function isStreamActive(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#streamCanvas');
    if (!canvas) return false;

    // Check if canvas has non-zero dimensions
    if (canvas.width === 0 || canvas.height === 0) return false;

    // Try to get image data to check if canvas has content
    try {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, 1, 1);
      return imageData.data.some((v) => v !== 0);
    } catch {
      return false;
    }
  });
}
