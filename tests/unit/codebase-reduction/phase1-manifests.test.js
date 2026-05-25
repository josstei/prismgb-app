import fs from 'fs';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import channels from '@shared/ipc/channels.json';
import ipcManifest from '@shared/ipc/ipc.manifest.json';
import eventManifest from '@shared/events/event.manifest.json';
import deviceManifest from '@shared/features/devices/device.manifest.json';
import { SettingsDefinitions as settingsDefinitions } from '@shared/features/settings/settings.definitions.js';
import { PRESET_POLICY } from '@prismgb/gpu';
import { EventChannels } from '@shared/events/event-channels.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';
import { SETTINGS_STORAGE_KEYS } from '@shared/config/storage-keys.config';
import {
  deviceHandlerDescriptors,
  gpuHandlerDescriptors,
  loginItemHandlerDescriptors,
  performanceHandlerDescriptors,
  shellHandlerDescriptors,
  transcodeHandlerDescriptors,
  updateHandlerDescriptors,
  windowHandlerDescriptors
} from '@main/ipc/handlers/index.js';
import { chromaticConfig, mediaConfig } from '@shared/features/devices/profiles/chromatic/device-chromatic.config.js';
import { DeviceRegistry } from '@shared/features/devices/device.registry.js';
import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import { CHROMATIC_E2E_FIXTURE } from '../../support/chromatic-device-specs.js';
import { createEventBus, createLogger, createLoggerFactory, createStorageService } from '../../support/dependencies.js';
import { expectNoDrift, flattenStringValues } from '../../support/contract-helpers.js';

const projectRoot = process.cwd();

function createSettingsService() {
  const logger = createLogger();
  return new SettingsService({
    eventBus: createEventBus(),
    loggerFactory: createLoggerFactory(logger),
    storageService: createStorageService()
  });
}

function collectIpcManifestChannels() {
  return ipcManifest.namespaces.flatMap((namespace) => [
    ...(namespace.invoke || []).map((entry) => entry.channel),
    ...(namespace.subscriptions || []).map((entry) => entry.channel)
  ]);
}

function collectIpcManifestExposedMethodOwners(namespaces = ipcManifest.namespaces) {
  return Object.fromEntries(namespaces.map((namespace) => [namespace.apiName, [...(namespace.invoke || []), ...(namespace.subscriptions || [])]
    .map((entry) => entry.factoryMethod || entry.method)
    .sort()]));
}

function collectEventValues(scope) {
  return eventManifest.scopes
    .find((entry) => entry.scope === scope)
    .events
    .map((entry) => entry.value);
}

function getSettingDefaults() {
  return Object.fromEntries(
    settingsDefinitions.definitions.map((definition) => [definition.name, definition.default])
  );
}

function collectHandlerArgumentSchemas() {
  return [
    ...deviceHandlerDescriptors,
    ...gpuHandlerDescriptors,
    ...loginItemHandlerDescriptors,
    ...performanceHandlerDescriptors,
    ...shellHandlerDescriptors,
    ...transcodeHandlerDescriptors,
    ...updateHandlerDescriptors,
    ...windowHandlerDescriptors
  ].map((descriptor) => [descriptor.channel, descriptor.argumentSchema || []]);
}

function collectRuntimeSourceFiles(rootDirectory) {
  return fs.readdirSync(rootDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      return collectRuntimeSourceFiles(absolutePath);
    }
    if (!/\.(js|ts)$/.test(entry.name)) {
      return [];
    }
    return [absolutePath];
  });
}

describe('Phase 1 manifests', () => {
  it('describes the current IPC channel and preload exposure surfaces', () => {
    expect(ipcManifest.mode).toBe('enforced');
    expectNoDrift(flattenStringValues(channels), collectIpcManifestChannels());

    const exposedApis = Object.fromEntries(
      ipcManifest.namespaces.map((namespace) => [namespace.apiName, [...namespace.exposedMethods].sort()])
    );

    expect(exposedApis).toEqual(collectIpcManifestExposedMethodOwners());
    expect(collectIpcManifestExposedMethodOwners([
      {
        apiName: 'preloadFactorySurface',
        invoke: [{ method: 'invokeInternal', factoryMethod: 'invokePublic' }],
        subscriptions: [{ method: 'subscribePublic' }]
      }
    ])).toEqual({ preloadFactorySurface: ['invokePublic', 'subscribePublic'] });
  });

  it('uses one import style for the runtime IPC channel contract', () => {
    const runtimeFiles = [
      ...collectRuntimeSourceFiles(path.join(projectRoot, 'src/main')),
      ...collectRuntimeSourceFiles(path.join(projectRoot, 'src/preload'))
    ];
    const channelImportAttributes = runtimeFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return [...source.matchAll(/import\s+[^;]*['"]@shared\/ipc\/channels\.json['"]([^;]*);/g)]
        .map((match) => match[1].trim());
    });

    expect(channelImportAttributes.length).toBeGreaterThan(0);
    expect(new Set(channelImportAttributes)).toEqual(new Set(['']));
  });

  it('keeps IPC manifest request schemas aligned with main handler descriptors', () => {
    const manifestRequests = new Map(
      ipcManifest.namespaces.flatMap((namespace) =>
        namespace.invoke.map((entry) => [entry.channel, entry.request])
      )
    );

    for (const [channel, argumentSchema] of collectHandlerArgumentSchemas()) {
      expect(manifestRequests.get(channel)).toEqual(argumentSchema);
    }
  });

  it('describes current renderer and main EventBus channels by scope', () => {
    expect(eventManifest.mode).toBe('enforced');
    expectNoDrift(flattenStringValues(EventChannels), collectEventValues('renderer'));
    expectNoDrift(flattenStringValues(MainEventChannels), collectEventValues('main'));

    const updateStateEvents = eventManifest.scopes
      .flatMap((scope) => scope.events.map((event) => ({ scope: scope.scope, ...event })))
      .filter((event) => event.value === 'update:state-changed');

    expect(updateStateEvents).toEqual([
      expect.objectContaining({ scope: 'renderer', payload: 'unknown' }),
      expect.objectContaining({ scope: 'main', payload: 'unknown' })
    ]);
  });

  it('describes current Chromatic metadata and generated-fixture targets', () => {
    const [chromatic] = deviceManifest.devices;

    expect(deviceManifest.mode).toBe('enforced');
    expect(chromatic).toMatchObject({
      id: chromaticConfig.id,
      name: chromaticConfig.name,
      manufacturer: chromaticConfig.manufacturer,
      usb: {
        vendorId: chromaticConfig.usb.vendorId,
        productId: chromaticConfig.usb.productId,
        deviceClass: chromaticConfig.usb.deviceClass,
        alternateDeviceClass: chromaticConfig.usb.alternateDeviceClass
      },
      display: {
        nativeWidth: chromaticConfig.display.nativeWidth,
        nativeHeight: chromaticConfig.display.nativeHeight,
        aspectRatio: chromaticConfig.display.aspectRatio
      },
      media: {
        video: mediaConfig.video
      },
      fixture: {
        defaultFrameRate: 60,
        supportedFrameRates: [30, 60],
        label: 'Chromatic'
      },
      labelPatterns: chromaticConfig.metadata.labelPatterns
    });

    expect(DeviceRegistry.get(chromatic.id)).toMatchObject({
      usb: {
        vendorId: chromatic.usb.vendorId,
        productId: chromatic.usb.productId
      },
      labelPatterns: chromatic.labelPatterns
    });

    expect(fs.readFileSync(path.join(projectRoot, 'src/shared/features/devices/device.registry.js'), 'utf8'))
      .toContain('DeviceManifest.devices.map');
    expect(fs.readFileSync(
      path.join(projectRoot, 'src/shared/features/devices/profiles/chromatic/device-chromatic.config.js'),
      'utf8'
    )).toContain('CHROMATIC_MANIFEST_ENTRY.media.video');
    expect(CHROMATIC_E2E_FIXTURE).toMatchObject({
      manifestId: chromatic.id,
      usbDeviceInfo: {
        vendorId: chromatic.usb.vendorId,
        productId: chromatic.usb.productId
      },
      display: {
        nativeWidth: chromatic.display.nativeWidth,
        nativeHeight: chromatic.display.nativeHeight,
        aspectRatio: chromatic.display.aspectRatio
      },
      videoDevice: {
        deviceId: chromatic.fixture.videoDeviceId,
        groupId: chromatic.fixture.groupId,
        kind: 'videoinput',
        label: chromatic.fixture.label
      },
      audioDevice: {
        deviceId: chromatic.fixture.audioDeviceId,
        groupId: chromatic.fixture.groupId,
        kind: 'audioinput',
        label: `${chromatic.fixture.label} Audio`
      }
    });
  });

  it('describes current settings defaults, keys, events, and known recording-format drift', async () => {
    const service = createSettingsService();
    const defaults = getSettingDefaults();
    const serviceDefaults = Object.fromEntries(
      await Promise.all(
        settingsDefinitions.definitions.map(async (definition) => [
          definition.name,
          await service.getSetting(definition.name)
        ])
      )
    );

    expect(defaults).toEqual(serviceDefaults);
    expect(settingsDefinitions.definitions.map((definition) => definition.storageKey).sort()).toEqual(
      [...SETTINGS_STORAGE_KEYS].sort()
    );

    const recordingFormat = settingsDefinitions.definitions.find((definition) => definition.name === 'recordingFormat');
    const rawSettingsDefinitions = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'src/shared/features/settings/settings.definitions.json'),
        'utf8'
      )
    );
    const rawRecordingFormat = rawSettingsDefinitions.definitions.find(
      (definition) => definition.name === 'recordingFormat'
    );
    const renderPreset = settingsDefinitions.definitions.find((definition) => definition.name === 'renderPreset');
    const rawRenderPreset = rawSettingsDefinitions.definitions.find(
      (definition) => definition.name === 'renderPreset'
    );

    expect(renderPreset.default).toBe(PRESET_POLICY.rendererDefaultId);
    expect(rawRenderPreset.defaultSource).toBe('PRESET_POLICY.rendererDefaultId');
    expect(rawRenderPreset).not.toHaveProperty('default');
    expect(recordingFormat.default).toBe('webm');
    expect(recordingFormat.allowedValues).toEqual(Object.keys(TRANSCODE_CONFIG.formats));
    expect(rawRecordingFormat.allowedValuesSource).toBe('TRANSCODE_CONFIG.formats');
    expect(rawRecordingFormat).not.toHaveProperty('allowedValues');
    expect(recordingFormat.default).not.toBe(TRANSCODE_CONFIG.defaultFormat);

    const settingsUiControls = Object.fromEntries(
      rawSettingsDefinitions.definitions
        .filter((definition) => definition.ui?.controlId)
        .map((definition) => [definition.name, definition.ui])
    );

    expect(settingsUiControls).toMatchObject({
      statusStripVisible: {
        controlName: 'statusStrip',
        controlId: 'settingStatusStrip',
        controlType: 'checkbox'
      },
      performanceMode: {
        controlName: 'animationSaver',
        controlId: 'settingAnimationSaver',
        controlType: 'checkbox'
      },
      recordingFormat: {
        controlName: 'recordingFormat',
        controlId: 'settingRecordingFormat',
        controlType: 'listbox',
        e2eToggle: false
      },
      launchOnLogin: {
        controlName: 'launchOnLogin',
        controlId: 'settingLaunchOnLogin',
        controlType: 'checkbox',
        e2eToggle: false
      }
    });
  });

  it('describes current render passes and package-owned shader files', () => {
    const renderPassManifest = JSON.parse(
      fs.readFileSync(
        path.join(projectRoot, 'packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.json'),
        'utf8'
      )
    );

    expect(renderPassManifest.passes.map((pass) => pass.id)).toEqual([
      'pixel-upscale',
      'unsharp-mask',
      'color-elevation',
      'crt-lcd'
    ]);
    expect(renderPassManifest.mode).toBe('enforced');

    for (const pass of renderPassManifest.passes) {
      expect(pass.enabledWhen).toEqual(expect.objectContaining({ kind: expect.any(String) }));
      expect(typeof pass.enabledWhen).not.toBe('string');
      expect(pass.webgpuUniformLayout).toEqual(expect.objectContaining({
        byteLength: expect.any(Number),
        members: expect.any(Array)
      }));
      expect(pass.webgl2Uniforms).toEqual(expect.objectContaining({
        texture: expect.objectContaining({ name: expect.any(String), method: expect.any(String) }),
        additional: expect.any(Array)
      }));
      expect(fs.existsSync(path.join(projectRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders', pass.webgpuShader))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, 'packages/prismgb-gpu/src/infrastructure/webgl2/shaders', pass.webgl2FragmentShader))).toBe(true);
    }
  });

  it('adds architecture and platform report-only manifests for current config drift checks', () => {
    const architectureManifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'scripts/manifests/architecture.manifest.json'), 'utf8')
    );
    const platformManifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'scripts/manifests/platforms.manifest.json'), 'utf8')
    );

    expect(architectureManifest.aliases.map((alias) => alias.id)).toEqual([
      '@',
      '@main',
      '@renderer',
      '@preload',
      '@shared',
      '@prismgb/gpu',
      'url'
    ]);
    expect(architectureManifest.retiredAliases).toContainEqual(
      expect.objectContaining({ id: '@core' })
    );
    expect(platformManifest.platforms.map((platform) => platform.label)).toEqual([
      'linux-x64',
      'linux-arm64',
      'macos-x64',
      'macos-arm64',
      'windows-x64'
    ]);
    expect(fs.readFileSync(path.join(projectRoot, 'scripts/ci/build-matrix.mjs'), 'utf8'))
      .toContain('manifest.platformGroups');
    expect(fs.readFileSync(path.join(projectRoot, 'scripts/smoke-test.js'), 'utf8'))
      .toContain('smokeExecutablePriority');
  });

  it('moves Vitest coverage output under ignored artifacts for the generated-artifact policy', () => {
    const vitestConfig = fs.readFileSync(path.join(projectRoot, 'vitest.config.js'), 'utf8');

    expect(vitestConfig).toContain("reportsDirectory: './artifacts/coverage'");
    expect(vitestConfig).not.toContain("reportsDirectory: './tests/coverage'");
    expect(vitestConfig).toContain('packages/prismgb-gpu/src/infrastructure/webgpu/**');
    expect(vitestConfig).toContain('packages/prismgb-gpu/src/infrastructure/webgl2/**');
    expect(vitestConfig).toContain('packages/prismgb-gpu/src/infrastructure/canvas2d/**');
  });

  it('keeps stream canvas aspect ratio derived from device metadata instead of fixed CSS literals', () => {
    const layoutCss = fs.readFileSync(path.join(projectRoot, 'src/renderer/presentation/styles/layout.css'), 'utf8');
    const canvasLifecycleSource = fs.readFileSync(
      path.join(projectRoot, 'src/renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts'),
      'utf8'
    );

    expect(layoutCss).toContain('aspect-ratio: var(--stream-native-aspect-ratio)');
    expect(layoutCss).not.toMatch(/aspect-ratio\s*:\s*160\s*\/\s*144/);
    expect(canvasLifecycleSource).toContain('--stream-native-aspect-ratio');
  });

  it('documents explicit Vitest project topology for browser, node, and GPU tests', () => {
    const vitestConfig = fs.readFileSync(path.join(projectRoot, 'vitest.config.js'), 'utf8');

    expect(vitestConfig).toContain("projects: [");
    expect(vitestConfig).toContain("name: 'shared-node'");
    expect(vitestConfig).toContain("name: 'renderer-happy-dom'");
    expect(vitestConfig).toContain("name: 'main-preload'");
    expect(vitestConfig).toContain("name: 'gpu-package'");
  });
});
