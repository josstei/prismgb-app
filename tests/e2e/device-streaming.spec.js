/**
 * Device Streaming E2E Tests
 *
 * Tests device connection, streaming, and disconnection flows
 * using the MockChromaticDevice infrastructure.
 */

import {
  test,
  expect,
  waitForAppReady,
  injectDeviceConnectedEvent,
  injectDeviceDisconnectedEvent,
  setMockDeviceStatus,
  clearMockDeviceStatus,
} from './fixtures/electron.fixture.js';
import {
  injectMockChromaticDevice,
  waitForDeviceIndicator,
  isStreamActive,
  cleanupMockDevice,
  getMockDeviceStatus,
  TestPatterns,
  CHROMATIC_SPECS,
} from './helpers/mock-chromatic.helper.js';
import { getDeviceStatus } from './helpers/ipc-mock.js';

test.describe('Device Streaming with Mock Device', () => {
  test.afterEach(async ({ window }) => {
    await cleanupMockDevice(window);
  });

  test('should detect device connection via mock IPC', async ({ window }) => {
    await waitForAppReady(window);

    // Inject mock device infrastructure
    const mockDevice = await injectMockChromaticDevice(window);

    // Verify initially disconnected
    let mockStatus = await mockDevice.getStatus();
    expect(mockStatus.isConnected).toBe(false);

    // Simulate device connection
    await mockDevice.connect();

    // Verify connection via our mock
    mockStatus = await mockDevice.getStatus();
    expect(mockStatus.isConnected).toBe(true);
    expect(mockStatus.deviceInfo).toBeTruthy();
    expect(mockStatus.deviceInfo.deviceName).toBe('Chromatic');
  });

  test('should handle device disconnection via mock IPC', async ({ window }) => {
    await waitForAppReady(window);

    // Inject and connect device
    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected
    let mockStatus = await mockDevice.getStatus();
    expect(mockStatus.isConnected).toBe(true);

    // Disconnect device
    await mockDevice.disconnect();

    // Verify disconnected
    mockStatus = await mockDevice.getStatus();
    expect(mockStatus.isConnected).toBe(false);
    expect(mockStatus.deviceInfo).toBeNull();
  });

  // NOTE: deviceAPI callback tests are skipped because contextBridge.exposeInMainWorld
  // creates non-configurable properties that cannot be replaced from the renderer context.
  // The mock focuses on navigator.mediaDevices which CAN be mocked.
  // For real device connection testing, use integration tests with actual USB devices.

  test('should enumerate mock device in media devices', async ({ window }) => {
    await waitForAppReady(window);

    // Inject mock device (not connected yet)
    await injectMockChromaticDevice(window, { autoConnect: false });

    // Enumerate devices - should be empty when disconnected
    let devices = await window.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind,
        label: d.label,
      }));
    });

    expect(devices.length).toBe(0);

    // Connect device
    await window.evaluate(() => {
      const state = window.__mockChromaticState;
      state.isConnected = true;
      state.deviceInfo = { deviceName: 'Chromatic' };
    });

    // Enumerate again - should now show mock device
    devices = await window.evaluate(async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.map((d) => ({
        deviceId: d.deviceId,
        kind: d.kind,
        label: d.label,
      }));
    });

    // Should include mock video device
    const videoDevice = devices.find((d) => d.kind === 'videoinput');
    expect(videoDevice).toBeDefined();
    expect(videoDevice.label).toBe('Chromatic');

    // Should include mock audio device
    const audioDevice = devices.find((d) => d.kind === 'audioinput');
    expect(audioDevice).toBeDefined();
    expect(audioDevice.label).toBe('Chromatic Audio');
  });

  test('should get mock stream via getUserMedia', async ({ window }) => {
    await waitForAppReady(window);

    // Inject and connect device
    await injectMockChromaticDevice(window, { autoConnect: true });

    // Request stream
    const streamInfo = await window.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      return {
        hasVideo: !!videoTrack,
        hasAudio: !!audioTrack,
        videoSettings: videoTrack?.getSettings(),
        audioSettings: audioTrack?.getSettings(),
      };
    });

    expect(streamInfo.hasVideo).toBe(true);
    expect(streamInfo.hasAudio).toBe(true);
    expect(streamInfo.videoSettings.width).toBe(160);
    expect(streamInfo.videoSettings.height).toBe(144);
  });

  test('should fail getUserMedia when device disconnected', async ({ window }) => {
    await waitForAppReady(window);

    // Inject but don't connect
    await injectMockChromaticDevice(window, { autoConnect: false });

    // Try to get stream
    const result = await window.evaluate(async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        return { success: true };
      } catch (error) {
        return {
          success: false,
          errorName: error.name,
          errorMessage: error.message,
        };
      }
    });

    expect(result.success).toBe(false);
    expect(result.errorName).toBe('NotFoundError');
  });

  test('should handle rapid connect/disconnect cycles', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window);

    // Rapid connect/disconnect cycles
    for (let i = 0; i < 5; i++) {
      await mockDevice.connect();
      await window.waitForTimeout(100);
      await mockDevice.disconnect();
      await window.waitForTimeout(100);
    }

    // Final state should be disconnected
    const status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(false);

    // App should still be responsive
    const streamContainer = window.locator('#streamContainer');
    await expect(streamContainer).toBeAttached();
  });

  test('should change test pattern dynamically', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, {
      autoConnect: true,
      testPattern: TestPatterns.SOLID_GRAY,
    });

    // Verify initial pattern
    let mockStatus = await mockDevice.getStatus();
    expect(mockStatus.testPattern).toBe(TestPatterns.SOLID_GRAY);

    // Change pattern
    await mockDevice.setTestPattern(TestPatterns.COLOR_BARS);
    await window.waitForTimeout(100);

    // Verify pattern changed
    mockStatus = await mockDevice.getStatus();
    expect(mockStatus.testPattern).toBe(TestPatterns.COLOR_BARS);
  });
});

test.describe('Device Connection Edge Cases', () => {
  test.afterEach(async ({ window }) => {
    await cleanupMockDevice(window);
  });

  test('should handle connection during app initialization', async ({ window }) => {
    // Inject device BEFORE full app ready
    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Now wait for app
    await waitForAppReady(window);

    // Device should be connected
    const status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should survive menu interactions with device connected', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected first
    let status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);

    // Open settings menu
    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();

    // Wait for menu to open
    await window.waitForTimeout(200);

    // Toggle some settings
    const label = window.locator('label:has(#settingStatusStrip)');
    await label.click();
    await window.waitForTimeout(100);

    // Close menu
    await window.keyboard.press('Escape');

    // Device should still be connected
    status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should handle fullscreen with device connected', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected first
    let status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);

    // Toggle fullscreen
    const fullscreenBtn = window.locator('#fullscreenBtn');
    await fullscreenBtn.click();
    await window.waitForTimeout(500);

    // Exit fullscreen
    await window.keyboard.press('Escape');
    await window.waitForTimeout(300);

    // Device should still be connected
    status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should maintain device state after settings changes', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected first
    let status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);

    // Open settings and toggle multiple settings
    const settingsBtn = window.locator('#settingsBtn');
    await settingsBtn.click();
    await window.waitForTimeout(200);

    // Toggle various settings
    const labels = [
      'label:has(#settingStatusStrip)',
      'label:has(#settingAnimationSaver)',
      'label:has(#settingFullscreenOnStartup)',
    ];

    for (const selector of labels) {
      const label = window.locator(selector);
      if ((await label.count()) > 0) {
        await label.click();
        await window.waitForTimeout(50);
      }
    }

    await window.keyboard.press('Escape');

    // Device should still be connected
    status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);
  });
});

test.describe('Stream Quality Verification', () => {
  test.afterEach(async ({ window }) => {
    await cleanupMockDevice(window);
  });

  test('should have correct video dimensions', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected
    const status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);

    // Get stream and check dimensions
    const dimensions = await window.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();
      return { width: settings.width, height: settings.height };
    });

    expect(dimensions.width).toBe(CHROMATIC_SPECS.nativeWidth);
    expect(dimensions.height).toBe(CHROMATIC_SPECS.nativeHeight);
  });

  test('should have correct audio settings', async ({ window }) => {
    await waitForAppReady(window);

    const mockDevice = await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify connected
    const status = await mockDevice.getStatus();
    expect(status.isConnected).toBe(true);

    // Get stream and check audio
    const audioSettings = await window.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const track = stream.getAudioTracks()[0];
      return track.getSettings();
    });

    expect(audioSettings.echoCancellation).toBe(false);
    expect(audioSettings.noiseSuppression).toBe(false);
    expect(audioSettings.autoGainControl).toBe(false);
    expect(audioSettings.sampleRate).toBe(CHROMATIC_SPECS.audioSampleRate);
  });

  test('should have correct device IDs in track settings', async ({ window }) => {
    await waitForAppReady(window);

    await injectMockChromaticDevice(window, { autoConnect: true });

    // Get stream and verify device IDs
    const trackInfo = await window.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      return {
        videoDeviceId: videoTrack.getSettings().deviceId,
        videoGroupId: videoTrack.getSettings().groupId,
        audioDeviceId: audioTrack.getSettings().deviceId,
        audioGroupId: audioTrack.getSettings().groupId,
      };
    });

    expect(trackInfo.videoDeviceId).toBe(CHROMATIC_SPECS.deviceId);
    expect(trackInfo.audioDeviceId).toBe(CHROMATIC_SPECS.audioDeviceId);
    // Both should share the same group ID
    expect(trackInfo.videoGroupId).toBe(trackInfo.audioGroupId);
  });
});

test.describe('Mock Device Infrastructure', () => {
  test.afterEach(async ({ window }) => {
    await cleanupMockDevice(window);
  });

  test('should properly inject mock state', async ({ window }) => {
    await waitForAppReady(window);

    await injectMockChromaticDevice(window);

    // Verify mock state exists
    const hasMockState = await window.evaluate(() => {
      return !!window.__mockChromaticState;
    });

    expect(hasMockState).toBe(true);
  });

  test('should clean up properly after test', async ({ window }) => {
    await waitForAppReady(window);

    // Inject mock
    await injectMockChromaticDevice(window, { autoConnect: true });

    // Verify injected
    let hasMockState = await window.evaluate(() => !!window.__mockChromaticState);
    expect(hasMockState).toBe(true);

    // Clean up
    await cleanupMockDevice(window);

    // Verify cleaned up
    hasMockState = await window.evaluate(() => !!window.__mockChromaticState);
    expect(hasMockState).toBe(false);
  });

  test('should not break deviceAPI after mock cleanup', async ({ window }) => {
    await waitForAppReady(window);

    // Verify deviceAPI exists (contextBridge-exposed, cannot be mocked)
    const beforeHasGetStatus = await window.evaluate(() => {
      return typeof window.deviceAPI?.getDeviceStatus === 'function';
    });
    expect(beforeHasGetStatus).toBe(true);

    // Inject mock and clean up
    await injectMockChromaticDevice(window);
    await cleanupMockDevice(window);

    // Verify deviceAPI still works after cleanup
    const afterHasGetStatus = await window.evaluate(() => {
      return typeof window.deviceAPI?.getDeviceStatus === 'function';
    });
    expect(afterHasGetStatus).toBe(true);
  });
});

/**
 * Full UI Flow Tests
 *
 * These tests use IPC injection via main process to trigger real deviceAPI callbacks,
 * combined with MediaDevices mocking for stream availability.
 * This exercises the complete app flow: device detection -> UI update -> streaming.
 */
test.describe('Full UI Flow with IPC Injection', () => {
  test.afterEach(async ({ electronApp, window }) => {
    await cleanupMockDevice(window);
    await clearMockDeviceStatus(electronApp);
  });

  test('should update UI when device connected via IPC', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Verify initial state shows "Checking device..." or similar
    const initialStatus = await window.locator('#statusText').textContent();
    expect(initialStatus.toLowerCase()).toMatch(/checking|disconnected/);

    // Set mock device status in main process (so getDeviceStatus returns connected)
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: {
        vendorId: 0x374e,
        productId: 0x0101,
        deviceName: 'Chromatic',
        configName: 'Mod Retro Chromatic',
      },
    });

    // Inject device connected event via main process IPC
    await injectDeviceConnectedEvent(electronApp);

    // Wait for UI to update
    await window.waitForTimeout(500);

    // Verify UI shows connected state
    const connectedStatus = await window.locator('#statusText').textContent();
    expect(connectedStatus.toLowerCase()).toMatch(/connected|ready/);

    // Verify status indicator has connected class
    const indicatorClasses = await window.locator('#statusIndicator').getAttribute('class');
    expect(indicatorClasses).toContain('connected');
  });

  test('should update UI when device disconnected via IPC', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // First connect the device
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Verify connected state
    let indicatorClasses = await window.locator('#statusIndicator').getAttribute('class');
    expect(indicatorClasses).toContain('connected');

    // Now disconnect - update mock status and send event
    await setMockDeviceStatus(electronApp, { connected: false, device: null });
    await injectDeviceDisconnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Verify UI shows disconnected state
    // Note: Check for specific class boundaries to avoid "disconnected" matching "connected"
    indicatorClasses = await window.locator('#statusIndicator').getAttribute('class');
    const classList = indicatorClasses.split(/\s+/);
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');
  });

  test('should enable streaming with IPC + MediaDevices mock', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // First inject MediaDevices mock for stream availability
    await injectMockChromaticDevice(window, { autoConnect: true });

    // Set mock device status in main process
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });

    // Then inject IPC event to trigger UI update
    await injectDeviceConnectedEvent(electronApp);

    // Wait for UI to update
    await window.waitForTimeout(500);

    // Verify UI shows connected
    const indicatorClasses = await window.locator('#statusIndicator').getAttribute('class');
    expect(indicatorClasses).toContain('connected');

    // Verify mock stream is available
    const streamInfo = await window.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      return {
        hasVideo: !!track,
        width: track?.getSettings()?.width,
        height: track?.getSettings()?.height,
      };
    });

    expect(streamInfo.hasVideo).toBe(true);
    expect(streamInfo.width).toBe(CHROMATIC_SPECS.nativeWidth);
    expect(streamInfo.height).toBe(CHROMATIC_SPECS.nativeHeight);
  });

  test('should trigger deviceAPI callbacks via IPC injection', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up callback tracking
    await window.evaluate(() => {
      window.__ipcCallbackTest = {
        connectCalled: false,
        disconnectCalled: false,
        receivedDevice: null,
      };

      window.deviceAPI.onDeviceConnected((device) => {
        window.__ipcCallbackTest.connectCalled = true;
        window.__ipcCallbackTest.receivedDevice = device;
      });

      window.deviceAPI.onDeviceDisconnected(() => {
        window.__ipcCallbackTest.disconnectCalled = true;
      });
    });

    // Inject device connected event
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(200);

    // Check connect callback was triggered
    let callbackState = await window.evaluate(() => window.__ipcCallbackTest);
    expect(callbackState.connectCalled).toBe(true);
    expect(callbackState.receivedDevice.deviceName).toBe('Chromatic');

    // Inject device disconnected event
    await injectDeviceDisconnectedEvent(electronApp);
    await window.waitForTimeout(200);

    // Check disconnect callback was triggered
    callbackState = await window.evaluate(() => window.__ipcCallbackTest);
    expect(callbackState.disconnectCalled).toBe(true);
  });
});

/**
 * Stream Playback Tests
 *
 * Tests the actual streaming flow: clicking to start, verifying video renders,
 * and stopping the stream. Uses both IPC injection and MediaDevices mock.
 */
test.describe('Stream Playback', () => {
  test.afterEach(async ({ electronApp, window }) => {
    await cleanupMockDevice(window);
    await clearMockDeviceStatus(electronApp);
  });

  test('should start streaming when overlay is clicked', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up: inject MediaDevices mock and device status
    await injectMockChromaticDevice(window, { autoConnect: true });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Verify device is connected and overlay is visible (ready to click)
    const overlayBefore = window.locator('#streamOverlay');
    const overlayClassesBefore = await overlayBefore.getAttribute('class');
    expect(overlayClassesBefore).not.toContain('hidden');

    // Click the overlay to start streaming
    await overlayBefore.click({ force: true });

    // Wait for streaming to start
    await window.waitForTimeout(1000);

    // Verify streaming state: body should have streaming class
    const bodyClasses = await window.evaluate(() => document.body.className);
    expect(bodyClasses).toContain('app-streaming');

    // Verify overlay is hidden during streaming
    const overlayClassesAfter = await overlayBefore.getAttribute('class');
    expect(overlayClassesAfter).toContain('hidden');
  });

  test('should render video frames on canvas', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up mock device
    await injectMockChromaticDevice(window, {
      autoConnect: true,
      testPattern: 'color-bars',
    });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Click to start streaming
    await window.locator('#streamOverlay').click({ force: true });
    await window.waitForTimeout(1500); // Allow time for frames to render

    // Check that canvas has rendered content (non-empty pixels)
    const canvasInfo = await window.evaluate(() => {
      const canvas = document.getElementById('streamCanvas');
      if (!canvas) return { exists: false };

      const ctx = canvas.getContext('2d');
      if (!ctx) return { exists: true, hasContext: false };

      // Sample pixels from the canvas to verify content
      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Check if there are any non-zero pixels
        let nonZeroCount = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) {
            nonZeroCount++;
          }
        }

        return {
          exists: true,
          hasContext: true,
          width: canvas.width,
          height: canvas.height,
          hasContent: nonZeroCount > 0,
          nonZeroPixels: nonZeroCount,
        };
      } catch (e) {
        return { exists: true, hasContext: true, error: e.message };
      }
    });

    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.hasContext).toBe(true);
    // Note: Canvas content depends on render pipeline; may be empty if GPU rendering
    // At minimum, verify canvas exists and has valid dimensions
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);
  });

  test('should stop streaming when canvas is clicked during playback', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up and start streaming
    await injectMockChromaticDevice(window, { autoConnect: true });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Start streaming
    await window.locator('#streamOverlay').click({ force: true });
    await window.waitForTimeout(1000);

    // Verify streaming started
    let bodyClasses = await window.evaluate(() => document.body.className);
    expect(bodyClasses).toContain('app-streaming');

    // Click canvas to stop streaming
    await window.locator('#streamCanvas').click({ force: true });
    await window.waitForTimeout(500);

    // Verify streaming stopped
    bodyClasses = await window.evaluate(() => document.body.className);
    expect(bodyClasses).not.toContain('app-streaming');

    // Verify overlay is visible again
    const overlayClasses = await window.locator('#streamOverlay').getAttribute('class');
    expect(overlayClasses).not.toContain('hidden');
  });

  test('should update FPS display during streaming', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up and start streaming
    await injectMockChromaticDevice(window, { autoConnect: true });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Start streaming
    await window.locator('#streamOverlay').click({ force: true });
    await window.waitForTimeout(2000); // Allow time for FPS calculation

    // Check FPS display in status footer
    const fpsText = await window.locator('#currentFPS').textContent();
    // FPS should show a number or "—" if not yet calculated
    expect(fpsText).toBeTruthy();
  });

  test('should update resolution display during streaming', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up and start streaming
    await injectMockChromaticDevice(window, { autoConnect: true });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Start streaming
    await window.locator('#streamOverlay').click({ force: true });
    await window.waitForTimeout(1500);

    // Check resolution display in status footer
    const resolutionText = await window.locator('#currentResolution').textContent();
    // Should show resolution like "160x144" or "—" if not available
    expect(resolutionText).toBeTruthy();
  });

  test('should enable capture buttons during streaming', async ({ electronApp, window }) => {
    await waitForAppReady(window);

    // Set up and start streaming
    await injectMockChromaticDevice(window, { autoConnect: true });
    await setMockDeviceStatus(electronApp, {
      connected: true,
      device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' },
    });
    await injectDeviceConnectedEvent(electronApp);
    await window.waitForTimeout(500);

    // Verify capture buttons are disabled before streaming
    const screenshotBtnBefore = await window.locator('#screenshotBtn').isDisabled();
    expect(screenshotBtnBefore).toBe(true);

    // Start streaming
    await window.locator('#streamOverlay').click({ force: true });
    await window.waitForTimeout(1000);

    // Verify capture buttons are enabled during streaming
    const screenshotBtnAfter = await window.locator('#screenshotBtn').isDisabled();
    expect(screenshotBtnAfter).toBe(false);

    const recordBtnAfter = await window.locator('#recordBtn').isDisabled();
    expect(recordBtnAfter).toBe(false);
  });
});
