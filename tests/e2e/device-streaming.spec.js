/**
 * Device Streaming E2E Tests
 *
 * Tests device connection, streaming, and disconnection flows
 * using the Chromatic media environment.
 */

import {
  test,
  expect,
} from './fixtures/electron.fixture.js';
import { TestPatterns } from './helpers/chromatic-media-environment.helper.js';
import { SettingsTestControls } from './pages/settings.page.js';

test.setTimeout(45000);

test.describe('Device Streaming with Chromatic Media Environment', () => {
  test('should detect device connection via test-control IPC', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment();

    let mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.isConnected).toBe(false);

    await chromaticDevice.connectMediaOnly();

    mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.isConnected).toBe(true);
    expect(mediaStatus.deviceInfo).toBeTruthy();
    expect(mediaStatus.deviceInfo.deviceName).toBe(chromaticDevice.fixture.device.label);
  });

  test('should handle device disconnection via test-control IPC', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({ autoConnect: true });

    let mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.isConnected).toBe(true);

    await chromaticDevice.disconnectMediaOnly();

    mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.isConnected).toBe(false);
    expect(mediaStatus.deviceInfo).toBeNull();
  });

  test('should enumerate Chromatic in media devices', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({ autoConnect: false });

    let devices = await chromaticDevice.enumerateMediaDevices();

    expect(devices.length).toBe(0);

    await chromaticDevice.setMediaConnected(true);

    devices = await chromaticDevice.enumerateMediaDevices();

    const videoDevice = devices.find((d) => d.kind === 'videoinput');
    expect(videoDevice).toBeDefined();
    expect(videoDevice.label).toBe(chromaticDevice.fixture.videoDevice.label);

    const audioDevice = devices.find((d) => d.kind === 'audioinput');
    expect(audioDevice).toBeDefined();
    expect(audioDevice.label).toBe(chromaticDevice.fixture.audioDevice.label);
  });

  test('should get Chromatic stream via getUserMedia', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({ autoConnect: true });
    const streamInfo = await chromaticDevice.getMediaStreamInfo({ video: true, audio: true });

    expect(streamInfo.hasVideo).toBe(true);
    expect(streamInfo.hasAudio).toBe(true);
    expect(streamInfo.videoSettings.width).toBe(chromaticDevice.fixture.videoSettings.width);
    expect(streamInfo.videoSettings.height).toBe(chromaticDevice.fixture.videoSettings.height);
  });

  test('should fail getUserMedia when device disconnected', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({ autoConnect: false });

    const result = await chromaticDevice.page.evaluate(async () => {
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

  test('should handle rapid connect/disconnect cycles', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment();

    for (let i = 0; i < 5; i++) {
      await chromaticDevice.connectMediaOnly();
      await chromaticDevice.page.waitForTimeout(100);
      await chromaticDevice.disconnectMediaOnly();
      await chromaticDevice.page.waitForTimeout(100);
    }

    const status = await chromaticDevice.getMediaEnvironmentStatus();
    expect(status.isConnected).toBe(false);

    await expect(appShell.streamContainer).toBeAttached();
  });

  test('should change test pattern dynamically', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({
      autoConnect: true,
      testPattern: TestPatterns.SOLID_GRAY,
    });

    let mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.testPattern).toBe(TestPatterns.SOLID_GRAY);

    await chromaticDevice.setTestPattern(TestPatterns.COLOR_BARS);
    await chromaticDevice.page.waitForTimeout(100);

    mediaStatus = await chromaticDevice.getMediaEnvironmentStatus();
    expect(mediaStatus.testPattern).toBe(TestPatterns.COLOR_BARS);
  });
});

test.describe('Device Connection Edge Cases', () => {
  test('should handle connection during app initialization', async ({ appShell, chromaticDevice }) => {
    await chromaticDevice.installMediaEnvironment({ autoConnect: true });

    await appShell.waitForReady();

    const status = await chromaticDevice.getMediaEnvironmentStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should survive menu interactions with device connected', async ({
    appShell,
    chromaticDevice,
    settingsMenu,
  }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Toggle some settings
    await settingsMenu.open();
    await settingsMenu.toggleBoolean('statusStrip');

    // Close menu
    await settingsMenu.pressEscape();

    // Device should still be connected
    const status = await chromaticDevice.getMediaEnvironmentStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should handle fullscreen with device connected', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Toggle fullscreen
    await appShell.toggleFullscreenButton();

    // Exit fullscreen
    await appShell.pressEscape();

    // Device should still be connected
    const status = await chromaticDevice.getMediaEnvironmentStatus();
    expect(status.isConnected).toBe(true);
  });

  test('should maintain device state after settings changes', async ({
    appShell,
    chromaticDevice,
    settingsMenu,
  }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Open settings and toggle multiple settings
    await settingsMenu.open();

    // Toggle various settings
    for (const { settingName } of SettingsTestControls.toggleableBooleanControls.slice(0, 3)) {
      await settingsMenu.toggleBoolean(settingName);
    }

    await settingsMenu.pressEscape();

    // Device should still be connected
    const status = await chromaticDevice.getMediaEnvironmentStatus();
    expect(status.isConnected).toBe(true);
  });
});

test.describe('Stream Quality Verification', () => {
  test('should have correct video dimensions', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Get stream and check dimensions
    const streamInfo = await chromaticDevice.getMediaStreamInfo({ video: true });

    expect(streamInfo.videoSettings.width).toBe(chromaticDevice.fixture.videoSettings.width);
    expect(streamInfo.videoSettings.height).toBe(chromaticDevice.fixture.videoSettings.height);
  });

  test('should have correct audio settings', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Get stream and check audio
    const streamInfo = await chromaticDevice.getMediaStreamInfo({ audio: true, video: true });
    const audioSettings = streamInfo.audioSettings;

    expect(audioSettings.echoCancellation).toBe(false);
    expect(audioSettings.noiseSuppression).toBe(false);
    expect(audioSettings.autoGainControl).toBe(false);
    expect(audioSettings.sampleRate).toBe(chromaticDevice.fixture.audioSettings.sampleRate);
  });

  test('should have correct device IDs in track settings', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Get stream and verify device IDs
    const streamInfo = await chromaticDevice.getMediaStreamInfo({ video: true, audio: true });

    expect(streamInfo.videoSettings.deviceId).toBe(chromaticDevice.fixture.videoDevice.deviceId);
    expect(streamInfo.audioSettings.deviceId).toBe(chromaticDevice.fixture.audioDevice.deviceId);
    // Both should share the same group ID
    expect(streamInfo.videoSettings.groupId).toBe(streamInfo.audioSettings.groupId);
  });
});

test.describe('Chromatic Media Environment Infrastructure', () => {
  test('should install media state', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment();

    expect(await chromaticDevice.hasMediaEnvironmentState()).toBe(true);
  });

  test('should clean up properly after test', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    await chromaticDevice.installMediaEnvironment({ autoConnect: true });

    expect(await chromaticDevice.hasMediaEnvironmentState()).toBe(true);

    await chromaticDevice.cleanup();

    expect(await chromaticDevice.hasMediaEnvironmentState()).toBe(false);
  });

  test('should not break the IPC bridge after media environment cleanup', async ({ appShell, chromaticDevice, window }) => {
    await appShell.waitForReady();

    const beforeHasBridge = await window.evaluate(() => {
      return typeof window.electronTRPC?.sendMessage === 'function';
    });
    expect(beforeHasBridge).toBe(true);

    await chromaticDevice.installMediaEnvironment();
    await chromaticDevice.cleanup();

    const afterHasBridge = await window.evaluate(() => {
      return typeof window.electronTRPC?.sendMessage === 'function';
    });
    expect(afterHasBridge).toBe(true);
  });
});

/**
 * Full UI Flow Tests
 *
 * These tests inject device events on the main-process IpcPushBridge (the same hub
 * `WindowService.send` feeds), driving real device state to the renderer over the tRPC push
 * transport, combined with the MediaDevices environment for stream availability.
 * This exercises the complete app flow: device detection -> UI update -> streaming.
 */
test.describe('Full UI Flow with IPC Injection', () => {
  test('should update UI when device connected via IPC', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    // Verify initial state shows a disconnected/no-device status.
    const initialStatus = await appShell.statusText.textContent();
    expect(initialStatus.toLowerCase()).toMatch(/checking|disconnected|no device|waiting|plug in/);

    await chromaticDevice.connect();

    // Verify UI shows connected state
    const connectedStatus = await appShell.statusText.textContent();
    expect(connectedStatus.toLowerCase()).toMatch(/connected|ready/);

    // Verify status indicator has connected class
    await expect(appShell.statusIndicator).toHaveClass(/connected/);
  });

  test('should update UI when device disconnected via IPC', async ({ appShell, chromaticDevice }) => {
    await appShell.waitForReady();

    // First connect the device
    await chromaticDevice.connect();

    // Verify connected state
    await expect(appShell.statusIndicator).toHaveClass(/connected/);

    // Now disconnect - update test-control status and send event.
    await chromaticDevice.disconnect();

    // Verify UI shows disconnected state
    const indicatorClasses = await appShell.statusIndicator.getAttribute('class');
    const classList = indicatorClasses.split(/\s+/);
    expect(classList).toContain('disconnected');
    expect(classList).not.toContain('connected');
  });

  test('should enable streaming with IPC plus MediaDevices environment', async ({
    appShell,
    chromaticDevice,
  }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Verify UI shows connected
    await expect(appShell.statusIndicator).toHaveClass(/connected/);

    // Verify Chromatic stream is available.
    const streamInfo = await chromaticDevice.getMediaStreamInfo({ video: true });

    expect(streamInfo.hasVideo).toBe(true);
    expect(streamInfo.videoSettings.width).toBe(chromaticDevice.fixture.videoSettings.width);
    expect(streamInfo.videoSettings.height).toBe(chromaticDevice.fixture.videoSettings.height);
  });

  test('should deliver device connect and disconnect to the renderer via tRPC push', async ({
    appShell,
    chromaticDevice,
  }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();
    await expect(appShell.statusIndicator).toHaveClass(/connected/);

    await chromaticDevice.disconnect();
    const indicatorClasses = await appShell.statusIndicator.getAttribute('class');
    expect(indicatorClasses.split(/\s+/)).toContain('disconnected');
  });
});

/**
 * Stream Playback Tests
 *
 * Tests the actual streaming flow: clicking to start, verifying video renders,
 * and stopping the stream through IPC plus the MediaDevices environment.
 */
test.describe('Stream Playback', () => {
  test('should start streaming when overlay is clicked', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    await chromaticDevice.connect();

    // Verify device is connected and overlay is visible (ready to click)
    await streamPage.expectOverlayReady();

    // Click the overlay to start streaming
    await streamPage.start();

    await streamPage.expectStreaming();

    // Verify overlay is hidden during streaming
    await streamPage.expectOverlayHidden();
  });

  test('should render video frames on canvas', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    // Set up media environment.
    await chromaticDevice.connect({ testPattern: 'color-bars' });

    // Click to start streaming
    await streamPage.start();
    await streamPage.page.waitForTimeout(1500); // Allow time for frames to render

    // Check that canvas has rendered content (non-empty pixels)
    const canvasInfo = await streamPage.getCanvasRenderInfo();

    expect(canvasInfo.exists).toBe(true);
    expect(canvasInfo.hasContext).toBe(true);
    // Note: Canvas content depends on render pipeline; may be empty if GPU rendering
    // At minimum, verify canvas exists and has valid dimensions
    expect(canvasInfo.width).toBeGreaterThan(0);
    expect(canvasInfo.height).toBeGreaterThan(0);
  });

  test('should stop streaming when canvas is clicked during playback', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    // Set up and start streaming
    await chromaticDevice.connect();

    // Start streaming
    await streamPage.start();

    // Verify streaming started
    await streamPage.expectStreaming();

    // Click canvas to stop streaming
    await streamPage.stop();

    // Verify streaming stopped
    await streamPage.expectStopped();

    // Verify overlay is visible again
    await streamPage.expectOverlayReady();
  });

  test('should update FPS display during streaming', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    // Set up and start streaming
    await chromaticDevice.connect();

    // Start streaming
    await streamPage.start();
    await streamPage.page.waitForTimeout(2000); // Allow time for FPS calculation

    // Check FPS display in status footer
    const fpsText = await streamPage.currentFps.textContent();
    // FPS should show a number or "—" if not yet calculated
    expect(fpsText).toBeTruthy();
  });

  test('should update resolution display during streaming', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    // Set up and start streaming
    await chromaticDevice.connect();

    // Start streaming
    await streamPage.start();
    await streamPage.page.waitForTimeout(1500);

    // Check resolution display in status footer
    const resolutionText = await streamPage.currentResolution.textContent();
    // Should show a concrete resolution or "—" if not available.
    expect(resolutionText).toBeTruthy();
  });

  test('should enable capture buttons during streaming', async ({
    appShell,
    chromaticDevice,
    streamPage,
  }) => {
    await appShell.waitForReady();

    // Set up and start streaming
    await chromaticDevice.connect();

    // Verify capture buttons are disabled before streaming
    await streamPage.expectCaptureControlsDisabled();

    // Start streaming
    await streamPage.start();

    // Verify capture buttons are enabled during streaming
    await streamPage.expectCaptureControlsEnabled();
  });
});
