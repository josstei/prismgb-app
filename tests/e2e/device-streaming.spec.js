import { test, expect } from './fixtures/electron.fixture.js';
import { TestPatterns, createChromaticDeviceStatusPayload } from './helpers/chromatic-media-environment.helper.js';
import { injectDeviceConnectedEvent, setTestDeviceStatus } from './helpers/device-ipc.helper.js';
import { SettingsTestControls } from './pages/settings.page.js';

test('media fixture preserves device contracts and cleans up without removing preload IPC', async ({
  appShell, chromaticDevice, page,
}) => {
  await chromaticDevice.installMediaEnvironment();
  await appShell.waitForReady();
  expect(await chromaticDevice.hasMediaEnvironmentState()).toBe(true);
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ isConnected: false });
  expect(await chromaticDevice.enumerateMediaDevices()).toEqual([]);
  expect(await page.evaluate(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      return null;
    } catch (error) { return error.name; }
  })).toBe('NotFoundError');
  await chromaticDevice.connectMediaOnly();
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({
    isConnected: true, deviceInfo: { deviceName: chromaticDevice.fixture.device.label },
  });
  const devices = await chromaticDevice.enumerateMediaDevices();
  expect(devices).toEqual(expect.arrayContaining([
    expect.objectContaining(chromaticDevice.fixture.videoDevice),
    expect.objectContaining(chromaticDevice.fixture.audioDevice),
  ]));
  await chromaticDevice.setTestPattern(TestPatterns.SOLID_GRAY);
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ testPattern: TestPatterns.SOLID_GRAY });
  await chromaticDevice.setTestPattern(TestPatterns.COLOR_BARS);
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ testPattern: TestPatterns.COLOR_BARS });
  for (let cycle = 0; cycle < 5; cycle++) {
    await chromaticDevice.disconnectMediaOnly();
    expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ isConnected: false, deviceInfo: null });
    await chromaticDevice.connectMediaOnly();
  }
  await chromaticDevice.disconnectMediaOnly();
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ isConnected: false, deviceInfo: null });
  await chromaticDevice.cleanup();
  expect(await chromaticDevice.hasMediaEnvironmentState()).toBe(false);
  expect(await page.evaluate(() => typeof window.electronTRPC?.sendMessage)).toBe('function');
});

test('production playback attaches paired tracks, renders frames, updates controls and stops on canvas click', async ({
  appShell, chromaticDevice, streamPage, page,
}) => {
  await appShell.waitForReady();
  await streamPage.expectCaptureControlsDisabled();
  await chromaticDevice.connect({ testPattern: 'color-bars' });
  await expect(appShell.statusText).toHaveText(/connected|ready/i);
  await streamPage.start();
  await streamPage.expectOverlayHidden();
  const tracks = await page.locator('#streamVideo').evaluate((video) => ({
    video: video.srcObject.getVideoTracks().map((track) => track.getSettings()),
    audio: video.srcObject.getAudioTracks().map((track) => track.getSettings()),
  }));
  expect(tracks.video).toHaveLength(1);
  expect(tracks.audio).toHaveLength(1);
  expect(tracks.video[0]).toMatchObject({
    width: chromaticDevice.fixture.videoSettings.width,
    height: chromaticDevice.fixture.videoSettings.height,
    deviceId: chromaticDevice.fixture.videoDevice.deviceId,
  });
  expect(tracks.audio[0]).toMatchObject({
    deviceId: chromaticDevice.fixture.audioDevice.deviceId,
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    sampleRate: chromaticDevice.fixture.audioSettings.sampleRate,
  });
  expect(tracks.video[0].groupId).toBe(tracks.audio[0].groupId);
  await streamPage.expectRenderedFrame();
  await expect(streamPage.currentFps).toHaveText(String(chromaticDevice.fixture.stream.defaultFrameRate) + ' fps');
  await expect(streamPage.currentResolution).toHaveText(
    String(chromaticDevice.fixture.videoSettings.width) + 'x' + String(chromaticDevice.fixture.videoSettings.height)
  );
  await streamPage.stop();
  await streamPage.expectOverlayReady();
  await streamPage.expectCaptureControlsDisabled();
  await expect(streamPage.currentFps).toHaveText('—');
  await expect(streamPage.currentResolution).toHaveText('—');
});

test('real device IPC reconnects repeatedly and remains connected through settings changes', async ({
  appShell, chromaticDevice, settingsMenu,
}) => {
  await appShell.waitForReady();
  for (let cycle = 0; cycle < 3; cycle++) {
    await chromaticDevice.connect();
    await expect(appShell.statusIndicator).toHaveClass(/(?:^|\s)connected(?:\s|$)/);
    await chromaticDevice.disconnect();
    await expect(appShell.statusIndicator).toHaveClass(/disconnected/);
    await expect(appShell.statusIndicator).not.toHaveClass(/(?:^|\s)connected(?:\s|$)/);
  }
  await chromaticDevice.connect();
  await settingsMenu.open();
  for (const { settingName } of SettingsTestControls.toggleableBooleanControls.slice(0, 3)) {
    await settingsMenu.toggleBoolean(settingName);
  }
  await settingsMenu.pressEscape();
  expect(await chromaticDevice.getMediaEnvironmentStatus()).toMatchObject({ isConnected: true });
  await expect(appShell.statusIndicator).toHaveClass(/(?:^|\s)connected(?:\s|$)/);
});

test('reports an actual acquisition failure and can retry when media becomes available', async ({
  appShell, chromaticDevice, streamPage, electronApp,
}) => {
  await appShell.waitForReady();
  await chromaticDevice.installMediaEnvironment();
  await setTestDeviceStatus(electronApp, createChromaticDeviceStatusPayload(true));
  await injectDeviceConnectedEvent(electronApp);
  await expect(appShell.statusIndicator).toHaveClass(/(?:^|\s)connected(?:\s|$)/);
  await streamPage.overlay.click({ force: true });
  await expect(streamPage.statusMessage).toContainText(/not authorized|No supported device|Device not found/i);
  await streamPage.expectStopped();
  await streamPage.expectCaptureControlsDisabled();
  await chromaticDevice.connectMediaOnly();
  await streamPage.start();
  await streamPage.expectRenderedFrame();
  await streamPage.stop();
});
