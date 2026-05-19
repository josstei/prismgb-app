import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { EventChannels } from '@shared/events/event-channels.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import settingsDefinitions from '@shared/features/settings/settings.definitions.json';
import { chromaticConfig, mediaConfig } from '@shared/features/devices/profiles/chromatic/device-chromatic.config.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { CHROMATIC_SPECS } from '../../e2e/helpers/mock-chromatic.helper.js';

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

function createSettingsService() {
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  };

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  };

  const service = new SettingsService({
    eventBus: {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    },
    loggerFactory: {
      create: vi.fn(() => logger)
    },
    storageService: storage
  });

  return { service, storage, logger };
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
    const { service } = createSettingsService();

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
      renderPreset: 'vibrant',
      globalBrightness: 1.0,
      performanceMode: false,
      fullscreenOnStartup: false,
      minimalistFullscreen: false,
      autoStreamOnConnect: false,
      recordingFormat: 'webm',
      launchOnLogin: false
    });
    expect(service.getAllowedValues('recordingFormat')).toEqual(['webm', 'mp4', 'mov']);
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
      vendorId: 0x374e,
      productId: 0x0101,
      nativeWidth: 160,
      nativeHeight: 144,
      aspectRatio: 160 / 144,
      defaultFrameRate: 60,
      labelPatterns: ['chromatic', 'modretro', 'mod retro', '374e:0101']
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
    const settingsSpecSource = readProjectFile('tests/e2e/settings.spec.js');
    const streamingSpecSource = readProjectFile('tests/e2e/streaming-smoke.spec.js');
    const ipcMockSource = readProjectFile('tests/e2e/helpers/ipc-mock.js');
    const preloadSource = readProjectFile('src/preload/index.js');

    expect(fixtureSource).toContain("waitForSelector('#streamContainer'");
    expect(fixtureSource).toContain("waitForSelector('#statusIndicator'");
    expect(fixtureSource).toContain("waitForSelector('#settingsBtn'");
    expect(fixtureSource).toContain("waitForSelector('.header'");

    expect(settingsSpecSource).toContain("window.locator('#settingsMenuContainer')");
    expect(settingsSpecSource).toContain("window.locator('#settingStatusStrip')");
    expect(settingsSpecSource).toContain("window.locator('#settingAnimationSaver')");
    expect(streamingSpecSource).toContain("window.locator('#streamCanvas')");
    expect(streamingSpecSource).toContain("window.locator('#shaderBtn')");

    expect(ipcMockSource).not.toMatch(/window\.deviceAPI\?\.onConnected/);
    expect(ipcMockSource).not.toMatch(/window\.deviceAPI\?\.onDisconnected/);
    expect(preloadSource).toContain('onDeviceConnected: deviceAPI.onConnected');
    expect(preloadSource).toContain('onDeviceDisconnected: deviceAPI.onDisconnected');
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
