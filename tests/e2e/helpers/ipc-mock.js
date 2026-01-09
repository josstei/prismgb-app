/**
 * IPC Mock Helpers for E2E Tests
 *
 * Provides utilities to simulate device connections and
 * other IPC events during E2E testing.
 */

/**
 * Mock device info for testing
 */
export const MOCK_DEVICE = {
  vendorId: 0x1209, // Mod Retro vendor ID
  productId: 0xcafe, // Test product ID
  name: 'Mod Retro Chromatic (Test)',
  serialNumber: 'TEST-001',
};

/**
 * Simulate device connection event in renderer
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} deviceInfo - Device info to emit
 */
export async function mockDeviceConnection(page, deviceInfo = MOCK_DEVICE) {
  await page.evaluate((device) => {
    // Dispatch custom event that device adapter listens to
    window.dispatchEvent(
      new CustomEvent('device:connected', {
        detail: device,
      })
    );

    // Also trigger the deviceAPI callback if it exists
    if (window.deviceAPI?.onConnected) {
      window.deviceAPI.onConnected(device);
    }
  }, deviceInfo);
}

/**
 * Simulate device disconnection event in renderer
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 */
export async function mockDeviceDisconnection(page) {
  await page.evaluate(() => {
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('device:disconnected'));

    // Also trigger the deviceAPI callback if it exists
    if (window.deviceAPI?.onDisconnected) {
      window.deviceAPI.onDisconnected();
    }
  });
}

/**
 * Create a mock media stream for testing video functionality
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} options - Stream options
 * @returns {Promise<string>} Stream ID
 */
export async function mockMediaStream(page, options = {}) {
  const { width = 160, height = 144, frameRate = 60 } = options;

  return page.evaluate(
    ({ width, height, frameRate }) => {
      // Create a canvas to generate test frames
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw test pattern
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#48bb78';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Test Stream', width / 2, height / 2);

      // Create stream from canvas
      const stream = canvas.captureStream(frameRate);

      // Store for cleanup
      window.__testMediaStream = stream;

      return stream.id;
    },
    { width, height, frameRate }
  );
}

/**
 * Stop the mock media stream
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 */
export async function stopMockMediaStream(page) {
  await page.evaluate(() => {
    if (window.__testMediaStream) {
      window.__testMediaStream.getTracks().forEach((track) => track.stop());
      delete window.__testMediaStream;
    }
  });
}

/**
 * Mock streaming API for E2E tests
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 */
export async function setupStreamingMocks(page) {
  await page.evaluate(() => {
    // Mock the streamAPI if not present
    if (!window.streamAPI) {
      window.streamAPI = {
        startStream: async () => ({ success: true }),
        stopStream: async () => ({ success: true }),
        onStreamData: () => () => {},
        onStreamError: () => () => {},
      };
    }
  });
}

/**
 * Mock capture API for E2E tests
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} options - Mock options
 */
export async function setupCaptureMocks(page, options = {}) {
  const { capturePath = '/tmp/test-captures' } = options;

  await page.evaluate((capturePath) => {
    // Mock the captureAPI if not present
    if (!window.captureAPI) {
      window.captureAPI = {
        takeScreenshot: async () => ({
          success: true,
          path: `${capturePath}/screenshot-${Date.now()}.png`,
        }),
        startRecording: async () => ({ success: true }),
        stopRecording: async () => ({
          success: true,
          path: `${capturePath}/recording-${Date.now()}.webm`,
        }),
        isRecording: false,
      };
    }
  }, capturePath);
}

/**
 * Mock settings API for E2E tests
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {Object} settings - Initial settings values
 */
export async function setupSettingsMocks(page, settings = {}) {
  const defaultSettings = {
    statusStrip: true,
    animationSaver: false,
    renderPreset: 'balanced',
    fullscreenOnStartup: false,
    minimalistFullscreen: false,
    autoStreamOnConnect: true,
    ...settings,
  };

  await page.evaluate((initialSettings) => {
    const settingsStore = { ...initialSettings };

    // Mock the settingsAPI if not present
    if (!window.settingsAPI) {
      window.settingsAPI = {
        get: async (key) => settingsStore[key],
        set: async (key, value) => {
          settingsStore[key] = value;
          return { success: true };
        },
        getAll: async () => ({ ...settingsStore }),
        reset: async () => {
          Object.keys(initialSettings).forEach((key) => {
            settingsStore[key] = initialSettings[key];
          });
          return { success: true };
        },
      };
    }
  }, defaultSettings);
}

/**
 * Wait for device status indicator to show specific state
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @param {'connected' | 'disconnected' | 'error'} state - Expected state
 * @param {Object} options - Wait options
 */
export async function waitForDeviceStatus(page, state, options = {}) {
  const { timeout = 5000 } = options;

  const stateClasses = {
    connected: '.connected',
    disconnected: ':not(.connected)',
    error: '.error',
  };

  const selector = `#statusIndicator${stateClasses[state] || ''}`;
  await page.waitForSelector(selector, { timeout, state: 'visible' });
}

/**
 * Get current device status from UI
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<Object>} Device status info
 */
export async function getDeviceStatus(page) {
  return page.evaluate(() => {
    const indicator = document.querySelector('#statusIndicator');
    const text = document.querySelector('#statusText');

    return {
      isConnected: indicator?.classList.contains('connected') ?? false,
      statusText: text?.textContent ?? '',
      indicatorClasses: indicator ? Array.from(indicator.classList) : [],
    };
  });
}
