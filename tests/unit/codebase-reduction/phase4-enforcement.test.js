import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createPreloadExposureMap } from '@preload/exposure.factory.js';
import { IpcContractManifest } from '@shared/ipc/ipc.manifest.js';
import { BUILD_OUTPUT_PATHS, GENERATED_PATHS } from '../../../scripts/clean-generated.js';

const projectRoot = process.cwd();

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

function projectPath(relativePath) {
  return path.join(projectRoot, relativePath);
}

function expectMissing(relativePath) {
  expect(fs.existsSync(projectPath(relativePath))).toBe(false);
}

function expectContainsAll(source, values) {
  values.forEach((value) => expect(source).toContain(value));
}

function expectExcludesAll(source, values) {
  values.forEach((value) => {
    if (value instanceof RegExp) {
      expect(source).not.toMatch(value);
      return;
    }
    expect(source).not.toContain(value);
  });
}

function collectFiles(relativeDirectory, predicate, files = []) {
  for (const entry of fs.readdirSync(projectPath(relativeDirectory), { withFileTypes: true })) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(relativePath, predicate, files);
      continue;
    }

    if (entry.isFile() && predicate(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function createManifestPreloadApiImplementations(manifest = IpcContractManifest) {
  return Object.fromEntries(
    manifest.namespaces.map((namespace) => [
      namespace.apiName,
      Object.fromEntries(
        namespace.exposedMethods.map((methodName) => [methodName, () => undefined])
      )
    ])
  );
}

describe('Phase 4 clean-break enforcement', () => {
  it('records Phase 4 as delivered work and keeps canonical test factories on ESM imports', () => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');
    const factoryIndex = readProjectFile('tests/factories/index.js');

    expect(implementationPlan).toContain('Historical phase delivery summary');
    expect(implementationPlan).toContain('Phase 4-6 added scorecard enforcement');
    expect(implementationPlan).toContain('Historical verification detail is intentionally summarized');
    expect(implementationPlan).not.toContain('Next phase when resumed: Phase 4');
    expect(factoryIndex).not.toMatch(/\brequire\(/);
  });

  it('keeps HideTimer retirement protected by explicit file and reference guards', () => {
    expectMissing('src/renderer/presentation/primitives/hide-timer.class.js');
    expectMissing('tests/unit/ui/primitives/hide-timer.test.js');

    const forbiddenPatterns = [
      { label: 'HideTimer identifier reference', pattern: /\bHideTimer\b/ },
      { label: 'hide-timer module/path reference', pattern: /hide-timer/ }
    ];
    const violations = [];
    const candidateFiles = [
      ...collectFiles('src', (relativePath) => /\.[cm]?[jt]sx?$/.test(relativePath)),
      ...[
        'tests/unit/ui',
        'tests/unit/features/notes/ui',
        'tests/unit/renderer/presentation/primitives'
      ].flatMap((root) => collectFiles(root, (relativePath) => /\.[cm]?[jt]sx?$/.test(relativePath)))
    ];

    candidateFiles.forEach((relativePath) => {
      const source = readProjectFile(relativePath);
      forbiddenPatterns.forEach(({ label, pattern }) => {
        if (pattern.test(source)) {
          violations.push(`${relativePath}: ${label}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  it('keeps remaining browser API test globals behind explicit installers', () => {
    const installerSource = readProjectFile('tests/support/mocks/browser-api.installers.js');
    [
      'installDevicePixelRatioMock',
      'installGetComputedStyleMock',
      'installMatchMediaMock',
      'installMissingMutationObserverMock'
    ].forEach((installerName) => {
      expect(installerSource).toContain(installerName);
    });

    const forbiddenPatterns = [
      { label: 'devicePixelRatio vi.stubGlobal', pattern: /\bvi\.stubGlobal\(['"]devicePixelRatio['"]/ },
      { label: 'window.getComputedStyle assignment', pattern: /\bglobal\.window\.getComputedStyle\s*=/ },
      { label: 'window.matchMedia assignment', pattern: /\bglobal\.window\.matchMedia\s*=/ },
      { label: 'MutationObserver delete', pattern: /\bdelete\s+globalThis\.MutationObserver\b/ },
      { label: 'MutationObserver assignment', pattern: /\bglobalThis\.MutationObserver\s*=/ }
    ];

    const violations = [];
    collectFiles('tests/unit', (relativePath) => /\.(test|spec)\.[jt]s$/.test(relativePath))
      .forEach((relativePath) => {
        const source = readProjectFile(relativePath);
        forbiddenPatterns.forEach(({ label, pattern }) => {
          if (pattern.test(source)) {
            violations.push(`${relativePath}: ${label}`);
          }
        });
      });

    expect(violations).toEqual([]);
  });

  it('keeps generated artifact ownership on current ignored paths without legacy coverage cleanup', () => {
    const gitignore = readProjectFile('.gitignore');
    const sizeReport = readProjectFile('scripts/codebase-size-report.js');
    const packageJson = readProjectJson('package.json');

    expectContainsAll(GENERATED_PATHS, ['artifacts/coverage']);
    expectExcludesAll(GENERATED_PATHS, ['tests/coverage']);
    expect(GENERATED_PATHS).not.toEqual(expect.arrayContaining(BUILD_OUTPUT_PATHS));
    expect(BUILD_OUTPUT_PATHS).toEqual(['dist', 'release', 'build', 'out']);
    expectContainsAll(gitignore, ['artifacts/']);
    expectExcludesAll(gitignore, ['tests/coverage/']);
    expectExcludesAll(sizeReport, ["'tests/coverage'"]);
    expect(packageJson.scripts['clean:generated']).toBe('node scripts/clean-generated.js');
    expect(packageJson.scripts['clean:build']).toBe('node scripts/clean-generated.js --build');
  });

  it('keeps phase-1 manifest ownership checks tied to generated feature-map and platform facts', () => {
    const featureMap = readProjectFile('docs/feature-map.md');
    const buildMatrix = readProjectFile('scripts/ci/build-matrix.mjs');
    const smokeTest = readProjectFile('scripts/smoke-test.js');
    const phase1Drift = readProjectFile('scripts/codebase-phase1-drift-report.js');

    expectContainsAll(featureMap, ['CODEBASE_FEATURE_MAP:START', 'CODEBASE_FEATURE_MAP:END', 'Architecture paths', 'Settings UI']);
    expectContainsAll(buildMatrix, ['platforms.manifest.json', 'manifest.platformGroups', 'manifest.smokeInputAliases']);
    expectContainsAll(smokeTest, ['platforms.manifest.json', 'smokeExecutablePriority']);
    expectContainsAll(phase1Drift, [
      'feature map generated manifest block is current',
      'createFeatureMapGeneratedBlock',
      'build matrix derives platform entries from platform manifest',
      'smoke test executable discovery derives from platform manifest'
    ]);
    expectExcludesAll(buildMatrix, ['linuxX64', /const entries\s*=\s*\{/]);
    expectExcludesAll(smokeTest, ['linux-unpacked', 'mac-arm64', 'win-unpacked']);
  });

  it('enforces every Phase 4 architecture ownership ratchet', () => {
    const thresholds = readProjectJson('scripts/architecture-thresholds.json');

    expect(thresholds.mode).toBe('enforce');
    expect(thresholds.limits).toMatchObject({
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      shaderDuplicateFileCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      sourceRuntimeJsFileCountMax: 59,
      hideTimerRetirementViolationCountMax: 0,
      sharedBaseInterfaceJsOrDtsFileCountMax: 0,
      inlineCanonicalMockAssignmentCountMax: 0,
      rendererBackendImplementationViolationCountMax: 0,
      renderPassManifestOwnershipViolationCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    });
  });

  it('keeps type and coverage debt ratchets owned and expiring', () => {
    const typeDebt = readProjectJson('scripts/type-debt-allowlist.json');
    const coverageThresholds = readProjectJson('scripts/coverage-thresholds.json');
    const sizeThresholds = readProjectJson('scripts/codebase-size-thresholds.json');
    const tsconfigApp = readProjectJson('tsconfig.app.json');
    const packageJson = readProjectJson('package.json');

    expect(typeDebt.defaultOwner).toBeTruthy();
    expect(typeDebt.defaultExpiresOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeDebt.entries.every((entry) => entry.expiresOn)).toBe(true);
    expect(coverageThresholds.mode).toBe('enforce');
    expect(coverageThresholds.targets.every((target) => target.owner && target.expiresOn)).toBe(true);
    expect(sizeThresholds.mode).toBe('enforce');
    expect(sizeThresholds.baseline.scopes).toEqual([
      'src/main',
      'src/renderer',
      'src/preload',
      'src/shared',
      'packages/prismgb-gpu/src'
    ]);
    expect(sizeThresholds.limits.runtimeSourceNetGrowthMax).toBe(0);
    expect(sizeThresholds.limits.trackedFilesTotalMax).toBe(687);
    expect(tsconfigApp.include).toContain('src/preload/**/*.ts');
    expect(packageJson.scripts['release:preflight']).toContain('codebase:size -- --enforce-thresholds');
  });

  it('keeps asset typings and migrated registries free of legacy compatibility aliases', () => {
    expect(fs.existsSync(projectPath('src/types/legacy-js-modules.d.ts'))).toBe(false);
    expect(fs.existsSync(projectPath('src/types/asset-modules.d.ts'))).toBe(true);
    const deviceRegistrySource = readProjectFile('src/shared/features/devices/device.registry.js');
    const typedRegistrySource = readProjectFile('src/shared/registry/typed-registry.factory.ts');

    const assetModules = readProjectFile('src/types/asset-modules.d.ts');

    expect(assetModules).toContain("declare module '*.svg?raw'");
    expect(assetModules).not.toMatch(/legacy|compat/i);
    expect(deviceRegistrySource).not.toMatch(/\bDEVICE_REGISTRY\b/);
    expect(typedRegistrySource).not.toMatch(/getValueMap|getMetadataMap|getFactoryMap/);
  });

  it('keeps built-in shader preset data centralized without per-preset modules', () => {
    [
      'packages/prismgb-gpu/src/domain/presets/presets/hi-def.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/performance.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/pixel.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/true-color.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/vibrant.preset.ts',
      'packages/prismgb-gpu/src/domain/presets/presets/vintage.preset.ts'
    ].forEach(expectMissing);

    const presetDefinitions = readProjectFile('packages/prismgb-gpu/src/domain/presets/preset-definitions.ts');
    const gpuEntry = readProjectFile('packages/prismgb-gpu/src/index.ts');
    const rendererContainer = readProjectFile('src/renderer/application/container.ts');
    const rawSettingsDefinitions = readProjectJson('src/shared/features/settings/settings.definitions.json');
    const renderPresetDefinition = rawSettingsDefinitions.definitions.find(
      (definition) => definition.name === 'renderPreset'
    );

    expect(presetDefinitions).toContain('BUILT_IN_PRESETS');
    expect(presetDefinitions).toContain('PRESET_POLICY');
    expect(presetDefinitions).toContain("rendererDefaultId: 'vibrant'");
    expect(presetDefinitions).toContain("id: 'true-color'");
    expect(presetDefinitions).toContain("id: 'performance'");
    expect(presetDefinitions).toContain('visibleInUI: performancePreset.id !== PRESET_POLICY.performancePresetId');
    expect(presetDefinitions).not.toContain("from './presets/");
    expect(gpuEntry).toContain('PresetRegistry.registerMany(BUILT_IN_PRESETS)');
    expect(rendererContainer).toContain('PresetRegistry.setDefault(PRESET_POLICY.rendererDefaultId)');
    expect(rendererContainer).not.toContain("PresetRegistry.setDefault('vibrant')");
    expect(renderPresetDefinition).toMatchObject({
      name: 'renderPreset',
      defaultSource: 'PRESET_POLICY.rendererDefaultId'
    });
    expect(renderPresetDefinition).not.toHaveProperty('default');
  });

  it('keeps renderer worker protocol-only and package-owned', () => {
    const workerSource = readProjectFile('src/renderer/infrastructure/rendering/workers/render.worker.ts');

    expect(workerSource).toContain("from '@prismgb/gpu'");
    expect(workerSource).toContain('createWorkerPipeline');
    expect(workerSource).not.toMatch(/webgpu-renderer\.engine|webgl2-renderer\.engine|optimization\.utils/);

    const renderWorkerImports = [...workerSource.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g)]
      .map((match) => match[1]);
    const nonProtocolRelativeImports = renderWorkerImports.filter((source) =>
      source.startsWith('./') && source !== './worker-protocol.config.js'
    );

    expect(nonProtocolRelativeImports).toEqual([]);
  });

  it('keeps Canvas2D fallback drawing package-owned', () => {
    const renderLoopSource = readProjectFile('src/renderer/infrastructure/services/streaming/canvas-render-loop.service.ts');

    expect(fs.existsSync(path.join(projectRoot, 'src/renderer/infrastructure/services/streaming/canvas-renderer.ts'))).toBe(false);
    expect(renderLoopSource).toContain("from '@prismgb/gpu'");
    expect(renderLoopSource).toContain('createPipeline');
    expect(renderLoopSource).toContain("preferredAPI: 'canvas2d'");
    expect(renderLoopSource).not.toMatch(/\.getContext\(|\.drawImage\(|imageSmoothingEnabled|CanvasRenderingContext2D/);
  });

  it('keeps stale test contracts and duplicate E2E device mocks deleted', () => {
    [
      'tests/contracts/event-contracts.js',
      'tests/contracts/index.js',
      'tests/e2e/helpers/ipc-mock.js',
      'tests/e2e/mocks/mock-chromatic-device.js',
      'tests/e2e/mocks/index.js'
    ].forEach(expectMissing);

    const electronFixture = readProjectFile('tests/e2e/fixtures/electron.fixture.js');
    const deviceIpcHelper = readProjectFile('tests/e2e/helpers/device-ipc.helper.js');
    const chromaticHelper = readProjectFile('tests/e2e/helpers/mock-chromatic.helper.js');
    const chromaticSupport = readProjectFile('tests/support/chromatic-device-specs.js');
    const mockDevice = readProjectFile('tests/mocks/MockDevice.js');

    expectContainsAll(electronFixture, ["from '../helpers/device-ipc.helper.js'"]);
    expectContainsAll(deviceIpcHelper, ["from '../../support/ipc-channels.js'"]);
    expectExcludesAll(electronFixture, [/const IPC_CHANNELS\s*=\s*\{/]);
    expectExcludesAll(deviceIpcHelper, [/const IPC_CHANNELS\s*=\s*\{/]);
    expectContainsAll(chromaticHelper, ["from '../../support/chromatic-device-specs.js'", 'CHROMATIC_E2E_FIXTURE', '{ fixture: CHROMATIC_E2E_FIXTURE']);
    expectContainsAll(chromaticSupport, ['CHROMATIC_E2E_FIXTURE', 'CHROMATIC_DEVICE_MANIFEST_ENTRY.fixture']);
    expectContainsAll(mockDevice, ["from '../support/chromatic-device-specs.js'"]);
  });

  it('keeps preload exposures and E2E device mocks on current manifest-owned contracts', () => {
    const preloadIndex = readProjectFile('src/preload/index.js');
    const preloadExposureFactory = readProjectFile('src/preload/exposure.factory.ts');
    const chromaticHelper = readProjectFile('tests/e2e/helpers/mock-chromatic.helper.js');
    const deviceStreamingSpec = readProjectFile('tests/e2e/device-streaming.spec.js');
    const fullscreenSpec = readProjectFile('tests/e2e/fullscreen.spec.js');
    const exposureMap = createPreloadExposureMap(createManifestPreloadApiImplementations());

    expect(preloadIndex).toContain("from '@preload/exposure.factory.js'");
    expect(preloadIndex).toContain('exposePreloadApis(contextBridge');
    expect(preloadIndex).not.toMatch(/contextBridge\.exposeInMainWorld\('[^']+',\s*\{/);
    expect(Object.keys(exposureMap)).toEqual(
      IpcContractManifest.namespaces.map((namespace) => namespace.apiName)
    );
    for (const namespace of IpcContractManifest.namespaces) {
      expect(Object.keys(exposureMap[namespace.apiName])).toEqual(namespace.exposedMethods);
    }
    expect(preloadExposureFactory).toContain("from '@shared/ipc/ipc.manifest.json'");
    expect(preloadExposureFactory).toContain('manifest.namespaces.map');
    expect(preloadExposureFactory).toContain('namespace.exposedMethods.map');

    expect(chromaticHelper).not.toMatch(/connectedCallbacks|disconnectedCallbacks/);
    expect(chromaticHelper).not.toContain('Trigger deviceAPI callbacks');
    expect(deviceStreamingSpec).toContain('chromaticDevice.fixture');
    expect(deviceStreamingSpec).not.toMatch(/CHROMATIC_SPECS|injectMockChromaticDevice|cleanupMockDevice/);
    expect(deviceStreamingSpec).not.toContain("toBe('Chromatic')");
    expect(deviceStreamingSpec).not.toContain("toBe('Chromatic Audio')");
    expect(fullscreenSpec).toContain('CHROMATIC_E2E_FIXTURE.display.aspectRatio');
    expect(fullscreenSpec).not.toContain('160 / 144');
    expect(deviceStreamingSpec).not.toContain('deviceAPI callback tests are skipped');
  });

  it('keeps Phase 6 shader source ownership discovered from package shader directories', () => {
    [
      'packages/prismgb-gpu/src/infrastructure/webgpu/webgpu-shader-loader.ts',
      'packages/prismgb-gpu/src/infrastructure/webgl2/webgl2-shader-loader.ts'
    ].forEach((relativePath) => {
      const loaderSource = readProjectFile(relativePath);

      expect(loaderSource).toContain('import.meta.glob');
      expect(loaderSource).not.toMatch(/import\s+\w+\s+from\s+['"]\.\/shaders\/[^'"]+\?raw['"]/);
      expect(loaderSource).not.toMatch(/['"][^'"]+\.(?:wgsl|glsl)['"]\s*:/);
    });
  });

  it('keeps presentation icons discovered by glob instead of manual imports', () => {
    const iconUtils = readProjectFile('src/renderer/presentation/icons/icon.utils.js');

    expect(iconUtils).toContain('import.meta.glob');
    expect(iconUtils).toContain("query: '?raw'");
    expect(iconUtils).not.toMatch(/import\s+\w+\s+from\s+['"][^'"]+\.svg\?raw['"]/);
  });

  it('keeps presentation icon assets and getIconSvg callers in lockstep', () => {
    const iconAssets = fs.readdirSync(projectPath('src/renderer/assets/icons'))
      .filter((filename) => filename.endsWith('.svg'))
      .map((filename) => filename.replace(/\.svg$/, ''))
      .sort();
    const iconCallPattern = /getIconSvg\(\s*['"]([^'"]+)['"]/g;
    const usedIcons = new Set();

    collectFiles(
      'src/renderer/presentation',
      (relativePath) => /\.(?:js|ts)$/.test(relativePath) && relativePath !== 'src/renderer/presentation/icons/icon.utils.js'
    ).forEach((relativePath) => {
      for (const match of readProjectFile(relativePath).matchAll(iconCallPattern)) {
        usedIcons.add(match[1]);
      }
    });

    expect([...usedIcons].sort()).toEqual(iconAssets);
  });

  it('keeps settings menu controls and recording format options derived from settings definitions', () => {
    const settingsTemplate = readProjectFile('src/renderer/presentation/features/settings/settings-menu.template.js');

    expectContainsAll(settingsTemplate, [
      'SettingsDefinitions.definitions.find',
      'createSettingsControlsTemplate',
      'definition.ui?.controlId',
      'getRecordingFormatOptions'
    ]);
    expectExcludesAll(settingsTemplate, [
      /id="setting(?:LaunchOnLogin|StatusStrip|FullscreenOnStartup|AutoStreamOnConnect|MinimalistFullscreen|AnimationSaver|RecordingFormat)"/,
      'Show Status Bar',
      'Auto-start stream',
      /data-value="(?:webm|mp4|mov)"/
    ]);
  });

  it('uses streaming-mode as the single streaming body-state contract', () => {
    [
      'src/renderer/presentation/effects/body-class.class.ts',
      'src/renderer/presentation/styles/base.css',
      'src/renderer/infrastructure/services/performance/performance-animation.service.ts',
      'src/renderer/application/orchestrators/performance-animation.orchestrator.ts',
      'tests/e2e/device-streaming.spec.js',
      'tests/e2e/streaming-smoke.spec.js'
    ].forEach((relativePath) => {
      expect(readProjectFile(relativePath)).not.toContain('app-streaming');
    });

    expect(readProjectFile('src/renderer/presentation/styles/base.css')).toContain('body.streaming-mode::after');
  });
});
