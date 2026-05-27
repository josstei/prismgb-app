import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { EventChannels } from '@shared/events/event-channels.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import { SettingsDefinitions as settingsDefinitions } from '@shared/features/settings/settings.definitions.js';
import { PRESET_POLICY } from '@prismgb/gpu';
import { chromaticConfig, mediaConfig } from '@shared/features/devices/profiles/chromatic/device-chromatic.config.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { CHROMATIC_E2E_FIXTURE, CHROMATIC_SPECS } from '../../support/chromatic-device-specs.js';
import { createSettingsServiceHarness } from '../../factories/index.js';

const projectRoot = process.cwd();

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function flattenStringValues(node) {
  const values = [];

  for (const value of Object.values(node)) {
    if (typeof value === 'string') {
      values.push(value);
      continue;
    }

    if (value && typeof value === 'object') {
      values.push(...flattenStringValues(value));
    }
  }

  return values;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function collectShaderTree(relativeRoot) {
  const absoluteRoot = path.join(projectRoot, relativeRoot);
  const files = {};

  for (const entry of fs.readdirSync(absoluteRoot, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name);
    if (extension !== '.glsl' && extension !== '.wgsl') {
      continue;
    }

    files[entry.name] = hashFile(path.join(absoluteRoot, entry.name));
  }

  return files;
}

describe('Phase 0 non-IPC contract baselines', () => {
  it('captures shared EventBus channel values before manifest migration', () => {
    expect(flattenStringValues(EventChannels).sort()).toEqual([
      'capture:recording-degraded',
      'capture:recording-error',
      'capture:recording-ready',
      'capture:recording-started',
      'capture:recording-stopped',
      'capture:screenshot-ready',
      'capture:screenshot-triggered',
      'device:disconnected-during-session',
      'device:enumeration-failed',
      'device:status-changed',
      'device:supported-device-available',
      'notes:note-created',
      'notes:note-deleted',
      'notes:note-updated',
      'performance:memory-snapshot-requested',
      'performance:render-mode-changed',
      'performance:state-changed',
      'performance:ui-mode-changed',
      'render:canvas-expired',
      'render:canvas-recreated',
      'render:capability-detected',
      'render:pipeline-error',
      'render:pipeline-ready',
      'render:stats-update',
      'settings:brightness-changed',
      'settings:cinematic-mode-changed',
      'settings:minimalist-fullscreen-changed',
      'settings:performance-mode-changed',
      'settings:preferences-loaded',
      'settings:recording-format-changed',
      'settings:render-preset-changed',
      'settings:volume-changed',
      'stream:error',
      'stream:health-ok',
      'stream:health-timeout',
      'stream:started',
      'stream:stopped',
      'system:handler-error',
      'transcode:cancelled',
      'transcode:completed',
      'transcode:error',
      'transcode:progress',
      'transcode:started',
      'ui:button-feedback',
      'ui:cinematic-toggle-requested',
      'ui:device-status',
      'ui:fullscreen-state',
      'ui:fullscreen-toggle-requested',
      'ui:overlay-error',
      'ui:overlay-message',
      'ui:overlay-visible',
      'ui:record-button-disabled',
      'ui:record-button-enabled',
      'ui:record-button-pop',
      'ui:record-button-press',
      'ui:recording-state',
      'ui:recording-toggle-requested',
      'ui:screenshot-requested',
      'ui:shutter-flash',
      'ui:status-message',
      'ui:stream-info',
      'ui:stream-start-requested',
      'ui:stream-stop-requested',
      'ui:streaming-mode',
      'ui:window-resized',
      'update:available',
      'update:badge-hide',
      'update:badge-show',
      'update:downloaded',
      'update:error',
      'update:not-available',
      'update:progress',
      'update:state-changed'
    ]);

    expect(MainEventChannels).toEqual({
      DEVICE: {
        CONNECTION_CHANGED: 'device:connection-changed',
        CHECK_ERROR: 'device:check-error'
      },
      UPDATE: {
        STATE_CHANGED: 'update:state-changed'
      }
    });
  });

  it('documents settings defaults and current recording/transcode format drift', async () => {
    const { service } = createSettingsServiceHarness();

    const defaults = Object.fromEntries(
      await Promise.all(
        settingsDefinitions.definitions.map(async (definition) => [
          definition.name,
          await service.getSetting(definition.name)
        ])
      )
    );

    expect(defaults).toEqual({
      gameVolume: 70,
      statusStripVisible: false,
      renderPreset: PRESET_POLICY.rendererDefaultId,
      globalBrightness: 1.0,
      performanceMode: false,
      fullscreenOnStartup: false,
      minimalistFullscreen: false,
      autoStreamOnConnect: false,
      recordingFormat: 'webm',
      launchOnLogin: false
    });
    expect(service.getAllowedValues('recordingFormat')).toEqual(Object.keys(TRANSCODE_CONFIG.formats));
    expect(service.getStringSetting('recordingFormat')).toBe('webm');

    expect(TRANSCODE_CONFIG.defaultFormat).toBe('mp4');
    expect(service.getStringSetting('recordingFormat')).not.toBe(TRANSCODE_CONFIG.defaultFormat);
  });

  it('captures Chromatic device metadata, capabilities, and E2E mock alignment', () => {
    expect(chromaticConfig).toMatchObject({
      id: 'chromatic-mod-retro',
      name: 'Mod Retro Chromatic',
      manufacturer: 'ModRetro',
      usb: {
        vendorId: 0x374e,
        productId: 0x0101,
        deviceClass: 0x0e,
        alternateDeviceClass: 0xef
      },
      display: {
        nativeWidth: 160,
        nativeHeight: 144,
        aspectRatio: 160 / 144,
        aspectRatioLabel: '10:9',
        pixelPerfect: true
      },
      capabilities: [
        'video-capture',
        'audio-capture',
        'screenshot',
        'recording',
        'pixel-perfect',
        'low-latency',
        'discord-integration'
      ]
    });

    expect(mediaConfig.video).toEqual({
      width: { ideal: 160 },
      height: { ideal: 144 },
      frameRate: { ideal: 60 }
    });

    expect(DeviceRegistry.get('chromatic-mod-retro')).toMatchObject({
      id: 'chromatic-mod-retro',
      name: 'Mod Retro Chromatic',
      manufacturer: 'ModRetro',
      enabled: true,
      usb: {
        vendorId: 0x374e,
        productId: 0x0101
      },
      labelPatterns: ['chromatic', 'modretro', 'mod retro', '374e:0101']
    });

    expect(CHROMATIC_SPECS).toMatchObject({
      vendorId: chromaticConfig.usb.vendorId,
      productId: chromaticConfig.usb.productId,
      nativeWidth: chromaticConfig.display.nativeWidth,
      nativeHeight: chromaticConfig.display.nativeHeight,
      aspectRatio: chromaticConfig.display.aspectRatio,
      defaultFrameRate: mediaConfig.video.frameRate.ideal,
      labelPatterns: chromaticConfig.metadata.labelPatterns
    });
    expect(CHROMATIC_E2E_FIXTURE).toMatchObject({
      manifestId: chromaticConfig.id,
      usbDeviceInfo: {
        vendorId: chromaticConfig.usb.vendorId,
        productId: chromaticConfig.usb.productId,
        deviceName: CHROMATIC_SPECS.label
      },
      display: {
        nativeWidth: chromaticConfig.display.nativeWidth,
        nativeHeight: chromaticConfig.display.nativeHeight,
        aspectRatio: chromaticConfig.display.aspectRatio
      },
      videoSettings: {
        width: chromaticConfig.display.nativeWidth,
        height: chromaticConfig.display.nativeHeight,
        frameRate: mediaConfig.video.frameRate.ideal
      },
      audioSettings: {
        sampleRate: 48000,
        channelCount: 2,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
  });

  it('uses package-owned shader trees after consolidation', () => {
    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/infrastructure/rendering/shaders/webgpu'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/infrastructure/rendering/shaders/webgl2'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, 'packages/prismgb-gpu/src/infrastructure/webgl2/shaders'))).toBe(true);
  });

  it('captures E2E selector assumptions and current deviceAPI callback naming', () => {
    const fixtureSource = readProjectFile('tests/e2e/fixtures/electron.fixture.js');
    const appShellPageSource = readProjectFile('tests/e2e/pages/app-shell.page.js');
    const settingsPageSource = readProjectFile('tests/e2e/pages/settings.page.js');
    const streamPageSource = readProjectFile('tests/e2e/pages/stream.page.js');
    const chromaticDeviceFixtureSource = readProjectFile('tests/e2e/fixtures/chromatic-device.fixture.js');
    const appLaunchSpecSource = readProjectFile('tests/e2e/app-launch.spec.js');
    const deviceConnectionSpecSource = readProjectFile('tests/e2e/device-connection.spec.js');
    const deviceStreamingSpecSource = readProjectFile('tests/e2e/device-streaming.spec.js');
    const fullscreenSpecSource = readProjectFile('tests/e2e/fullscreen.spec.js');
    const settingsSpecSource = readProjectFile('tests/e2e/settings.spec.js');
    const streamingSpecSource = readProjectFile('tests/e2e/streaming-smoke.spec.js');
    const preloadSource = readProjectFile('src/preload/index.ts');
    const ipcManifest = JSON.parse(readProjectFile('src/shared/ipc/ipc.manifest.json'));
    const deviceNamespace = ipcManifest.namespaces.find((namespace) => namespace.apiName === 'deviceAPI');

    expect(fixtureSource).toContain("from '../pages/app-shell.page.js'");
    expect(fixtureSource).toContain('appShell: async');
    expect(fixtureSource).toContain('settingsMenu: async');
    expect(fixtureSource).toContain('streamPage: async');
    expect(fixtureSource).toContain('chromaticDevice: async');
    expect(appShellPageSource).toContain("streamContainer: '#streamContainer'");
    expect(appShellPageSource).toContain("deviceStatus: '#deviceStatus'");
    expect(appShellPageSource).toContain("statusIndicator: '#statusIndicator'");
    expect(appShellPageSource).toContain("settingsButton: '#settingsBtn'");
    expect(appShellPageSource).toContain("fullscreenButton: '#fullscreenBtn'");
    expect(appShellPageSource).toContain("fullscreenControls: '#fullscreenControls'");
    expect(appShellPageSource).toContain("fullscreenExitButton: '#fsExitBtn'");
    expect(appShellPageSource).toContain("header: '.header'");
    expect(settingsPageSource).toContain("menu: AppSelectors.settingsMenu");
    expect(settingsPageSource).toContain('settings.definitions.json');
    expect(settingsPageSource).toContain('createSettingsControlMetadata');
    expect(settingsPageSource).toContain('SettingsTestControls.controls');
    expect(settingsPageSource).not.toContain("statusStrip: '#settingStatusStrip'");
    expect(settingsPageSource).not.toContain("animationSaver: '#settingAnimationSaver'");
    expect(settingsSpecSource).toContain('settingsMenu');
    expect(settingsSpecSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(settingsSpecSource).not.toContain("window.locator('#settingsMenuContainer')");
    expect(settingsSpecSource).not.toContain("window.locator('#settingStatusStrip')");
    expect(settingsSpecSource).not.toContain("window.locator('#settingAnimationSaver')");
    expect(streamPageSource).toContain("canvas: '#streamCanvas'");
    expect(streamPageSource).toContain("shaderButton: '#shaderBtn'");
    expect(streamPageSource).toContain("currentFps: '#currentFPS'");
    expect(streamPageSource).toContain("currentResolution: '#currentResolution'");
    expect(chromaticDeviceFixtureSource).toContain('class ChromaticDeviceFixture');
    expect(chromaticDeviceFixtureSource).toContain("from '../helpers/device-ipc.helper.js'");
    expect(chromaticDeviceFixtureSource).toContain('getMediaStreamInfo');
    expect(chromaticDeviceFixtureSource).toContain('expectDisconnected');
    expect(streamingSpecSource).toContain('streamPage');
    expect(streamingSpecSource).toContain('chromaticDevice');
    expect(streamingSpecSource).not.toContain("window.locator('#streamCanvas')");
    expect(streamingSpecSource).not.toContain("window.locator('#shaderBtn')");
    expect(deviceConnectionSpecSource).toContain('appShell');
    expect(deviceConnectionSpecSource).toContain('settingsMenu');
    expect(deviceConnectionSpecSource).toContain('streamPage');
    expect(deviceConnectionSpecSource).not.toContain("window.locator('#settingsBtn')");
    expect(deviceConnectionSpecSource).not.toContain("window.locator('#streamCanvas')");
    expect(deviceStreamingSpecSource).toContain('appShell');
    expect(deviceStreamingSpecSource).toContain('chromaticDevice');
    expect(deviceStreamingSpecSource).toContain('streamPage');
    expect(deviceStreamingSpecSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(deviceStreamingSpecSource).not.toMatch(/import\s+\{[^}]*waitForAppReady/);
    expect(deviceStreamingSpecSource).not.toMatch(/await waitForAppReady\(/);
    expect(deviceStreamingSpecSource).not.toContain('window.locator(');
    expect(deviceStreamingSpecSource).not.toContain("from './helpers/device-status.helper.js'");
    expect(appLaunchSpecSource).toContain('appShell');
    expect(appLaunchSpecSource).toContain('settingsMenu');
    expect(appLaunchSpecSource).toContain('SettingsTestControls.toggleableBooleanControls');
    expect(appLaunchSpecSource).not.toMatch(/import\s+\{[^}]*waitForAppReady/);
    expect(appLaunchSpecSource).not.toMatch(/await waitForAppReady\(/);
    expect(appLaunchSpecSource).not.toContain("window.locator('#fullscreenBtn')");
    expect(appLaunchSpecSource).not.toContain("window.locator('#statusIndicator')");
    expect(appLaunchSpecSource).not.toContain("window.locator('#statusText')");
    expect(appLaunchSpecSource).not.toContain("window.locator('#deviceStatus')");
    expect(fullscreenSpecSource).toContain('appShell');
    expect(fullscreenSpecSource).toContain('streamPage');
    expect(fullscreenSpecSource).not.toContain("window.locator('#fullscreenBtn')");
    expect(fullscreenSpecSource).not.toContain("window.locator('#fullscreenControls')");
    expect(fullscreenSpecSource).not.toContain("window.locator('#fsExitBtn')");
    expect(fullscreenSpecSource).not.toContain("window.locator('#streamCanvas')");

    expect(fs.existsSync(path.join(projectRoot, 'tests/e2e/helpers/ipc-mock.js'))).toBe(false);
    expect(readProjectFile('tests/e2e/device-connection.spec.js')).toContain(
      "from './helpers/device-status.helper.js'"
    );
    expect(deviceNamespace.exposedMethods).toEqual([
      'getDeviceStatus',
      'onDeviceConnected',
      'onDeviceDisconnected'
    ]);
    expect(preloadSource).toContain('exposePreloadApis(contextBridge');
    expect(preloadSource).toContain('IpcManifest.namespaces.map');
    expect(preloadSource).not.toContain('onDeviceConnected: deviceAPI.onDeviceConnected');
    expect(preloadSource).not.toContain('onDeviceDisconnected: deviceAPI.onDeviceDisconnected');
  });

  it('keeps E2E Chromatic media-device patches fully restorable', () => {
    const chromaticHelperSource = readProjectFile('tests/e2e/helpers/mock-chromatic.helper.js');

    expect(chromaticHelperSource).toContain('addEventListener: originalAddEventListener');
    expect(chromaticHelperSource).toContain('removeEventListener: originalRemoveEventListener');
    expect(chromaticHelperSource).toContain('navigator.mediaDevices.addEventListener = originals.addEventListener');
    expect(chromaticHelperSource).toContain(
      'navigator.mediaDevices.removeEventListener = originals.removeEventListener'
    );
  });

  it('captures current release artifact targets and output locations', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'));

    expect(packageJson.build.directories).toEqual({
      output: 'release',
      buildResources: 'assets'
    });
    expect(packageJson.build.files).toEqual([
      'dist/**/*',
      '!dist/*-unpacked/**/*',
      '!dist/*.AppImage',
      '!dist/*.deb',
      '!dist/*.tar.gz',
      '!dist/*.dmg',
      '!dist/*.exe',
      '!dist/*.msi',
      '!dist/*.pkg',
      '!dist/*.zip',
      '!dist/*.snap',
      '!dist/*.blockmap',
      '!dist/latest-*.yml',
      '!dist/builder-debug.yml'
    ]);
    expect(packageJson.build.mac.target).toEqual(['dmg', 'zip']);
    expect(packageJson.build.linux.target).toEqual(['AppImage', 'deb', 'tar.gz']);
    expect(packageJson.build.win.target).toEqual([
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ]);
    expect(packageJson.build.publish).toMatchObject({
      provider: 'github',
      owner: 'josstei',
      repo: 'prismgb-app',
      releaseType: 'draft'
    });
  });
});
