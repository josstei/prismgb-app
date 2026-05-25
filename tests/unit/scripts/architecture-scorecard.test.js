import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectAnyMetrics,
  countExplicitAnyKeywords,
  collectAliasDriftMetrics,
  collectContractMetrics,
  collectInlineMockAssignments,
  collectPlatformDriftMetrics,
  collectRuntimeTwinMetrics,
  collectShaderDuplicateMetrics,
  collectSharedTypeScriptCutoverMetrics,
  collectRendererBackendImplementationMetrics,
  collectRenderPassManifestOwnershipMetrics,
  collectRetiredHideTimerMetrics,
  collectSourceRuntimeJsMetrics,
  evaluateThresholds,
  parseCliArgs
} from '../../../scripts/architecture-scorecard.js';
import { PRELOAD_API_NAMES } from '../../support/mocks/preload-api-globals.js';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

function createTempProject(prefix, files = {}) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(tempRoot);
  for (const [relativePath, source] of Object.entries(files)) {
    const absolutePath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  return tempRoot;
}

function createMetrics(overrides = {}) {
  return {
    boundaryViolationCount: 0,
    infraToPresentationImportCount: 0,
    crossProcessImportCount: 0,
    tsStrictness: {
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true
    },
    any: {
      occurrenceCount: 10,
      filesWithAnyCount: 3
    },
    topRuntimeFiles: [
      { file: 'src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts', loc: 500 }
    ],
    unexpectedContractFileCount: 0,
    totalContractLikeFiles: 13,
    unexpectedContractFiles: [],
    shaderDuplicateDivergenceCount: 0,
    shaderDuplicateFileCount: 0,
    runtimeJsDtsTwinCount: 0,
    sourceRuntimeJsFileCount: 59,
    hideTimerRetirementViolationCount: 0,
    sharedBaseInterfaceJsOrDtsFileCount: 0,
    inlineCanonicalMockAssignmentCount: 0,
    aliasManifestDriftCount: 0,
    platformManifestDriftCount: 0,
    rendererBackendImplementationViolationCount: 0,
    rendererBackendImplementationViolationFiles: [],
    renderPassManifestOwnershipViolationCount: 0,
    renderPassManifestOwnershipViolations: [],
    ...overrides
  };
}

describe('architecture-scorecard cli args', () => {
  it('parses threshold enforcement options', () => {
    const options = parseCliArgs([
      '--enforce-thresholds',
      '--thresholds',
      'custom/limits.json',
      '--summary-output',
      'artifacts/summary.md'
    ]);

    expect(options.enforceThresholds).toBe(true);
    expect(options.thresholdsPath).toBe('custom/limits.json');
    expect(options.summaryOutput).toBe('artifacts/summary.md');
  });
});

describe('architecture-scorecard explicit any metrics', () => {
  it('counts TypeScript any keywords without counting comments, strings, or property names', () => {
    const source = `
      // any in a comment should not count
      const label = 'any in a string';
      Promise.any([Promise.resolve(true)]);
      type Alias = any;
      function accept(value: any): Array<any> {
        const map: Record<string, any> = {};
        return [value, map.value];
      }
    `;

    expect(countExplicitAnyKeywords(source)).toBe(4);
  });

  it('reports explicit any counts by source file', () => {
    const tempRoot = createTempProject('prismgb-scorecard-any-', {
      'renderer/typed.ts': 'type Payload = unknown; // any comment only\n',
      'renderer/loose.ts': 'export function loose(value: any): any { return value; }\n'
    });

    expect(collectAnyMetrics(tempRoot)).toMatchObject({
      occurrenceCount: 2,
      filesWithAnyCount: 1,
      files: [
        {
          file: 'renderer/loose.ts',
          count: 2
        }
      ]
    });
  });
});

describe('evaluateThresholds', () => {
  const ownershipLimitKeys = ['unexpectedContractFileCountMax', 'shaderDuplicateDivergenceCountMax', 'shaderDuplicateFileCountMax', 'runtimeJsDtsTwinCountMax', 'sourceRuntimeJsFileCountMax', 'hideTimerRetirementViolationCountMax', 'sharedBaseInterfaceJsOrDtsFileCountMax', 'inlineCanonicalMockAssignmentCountMax', 'rendererBackendImplementationViolationCountMax', 'renderPassManifestOwnershipViolationCountMax', 'aliasManifestDriftCountMax', 'platformManifestDriftCountMax'];
  const ownershipLimits = Object.fromEntries(ownershipLimitKeys.map((key) => [key, key === 'sourceRuntimeJsFileCountMax' ? 59 : 0]));

  it('passes when all configured limits are satisfied', () => {
    const metrics = createMetrics();
    const limits = {
      boundaryViolationCount: 0,
      infraToPresentationImportCount: 0,
      crossProcessImportCount: 0,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      anyOccurrenceCountMax: 10,
      topRuntimeFileLocMax: 600
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.failures).toHaveLength(0);
  });

  it('fails when strictness or count limits regress', () => {
    const metrics = createMetrics({
      tsStrictness: {
        strict: false,
        noImplicitAny: true,
        strictNullChecks: true
      },
      any: {
        occurrenceCount: 11,
        filesWithAnyCount: 3
      }
    });
    const limits = { strict: true, anyOccurrenceCountMax: 10, ...ownershipLimits };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(2);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual(['tsStrictness.strict', 'any.occurrenceCount']);
  });

  it('fails when new ownership violations exceed thresholds', () => {
    const metrics = createMetrics({
      unexpectedContractFileCount: 1,
      shaderDuplicateDivergenceCount: 1,
      shaderDuplicateFileCount: 1,
      runtimeJsDtsTwinCount: 1,
      sourceRuntimeJsFileCount: 60,
      hideTimerRetirementViolationCount: 1,
      sharedBaseInterfaceJsOrDtsFileCount: 1,
      inlineCanonicalMockAssignmentCount: 1,
      rendererBackendImplementationViolationCount: 1,
      renderPassManifestOwnershipViolationCount: 1,
      aliasManifestDriftCount: 1,
      platformManifestDriftCount: 1
    });

    const evaluation = evaluateThresholds(metrics, ownershipLimits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(12);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual(['unexpectedContractFileCount', 'shaderDuplicateDivergenceCount', 'shaderDuplicateFileCount', 'runtimeJsDtsTwinCount', 'sourceRuntimeJsFileCount', 'hideTimerRetirementViolationCount', 'sharedBaseInterfaceJsOrDtsFileCount', 'inlineCanonicalMockAssignmentCount', 'rendererBackendImplementationViolationCount', 'renderPassManifestOwnershipViolationCount', 'aliasManifestDriftCount', 'platformManifestDriftCount']);
  });
});

describe('phase 4 enforcement metrics', () => {
  it('reports no unexpected hand-maintained contract files in current ownership', () => {
    const metrics = collectContractMetrics(process.cwd());
    expect(metrics.totalContractLikeFiles).toBe(13);
    expect(metrics.unexpectedContractFileCount).toBe(0);
  });

  it('fails contract ownership checks for new or stale contract-like files', () => {
    [
      {
        prefix: 'prismgb-scorecard-contract-',
        files: {
          'src/shared/ipc/channels.json': '{}',
          'src/shared/contracts/custom.contract.ts': 'export {}'
        },
        unexpected: 'src/shared/contracts/custom.contract.ts'
      },
      {
        prefix: 'prismgb-scorecard-stale-test-contract-',
        files: {
          'tests/contracts/event-contracts.js': 'export const EventContracts = {};\n'
        },
        unexpected: 'tests/contracts/event-contracts.js'
      }
    ].forEach(({ prefix, files, unexpected }) => {
      const metrics = collectContractMetrics(createTempProject(prefix, files));
      expect(metrics.unexpectedContractFileCount).toBe(1);
      expect(metrics.unexpectedContractFiles).toContain(unexpected);
    });
  });

  it('reports baseline inline canonical API mock assignments and detects additions', () => {
    const baseline = collectInlineMockAssignments(process.cwd());
    expect(baseline.inlineCanonicalMockAssignmentCount).toBe(0);

    const deviceApiReference = ['window', 'deviceAPI'].join('.');
    const metricsApiReference = ['globalThis', 'metricsAPI'].join('.');
    const tempRoot = createTempProject('prismgb-scorecard-mock-', {
      'tests/adapter-mocks.test.ts': `${deviceApiReference} = {}\n`
        + `delete ${deviceApiReference};\n`
        + `${metricsApiReference} = {};\n`
        + "global.window = { shellAPI: {}, gpuAPI: {} };\n"
        + "Object.assign(window, { updateAPI: {}, loginItemAPI: {} });\n"
        + "Object.defineProperty(window, 'transcodeAPI', { value: {} });\n"
        + "Object.defineProperties(globalThis.window, { windowAPI: { value: {} } });\n"
    });
    const mutant = collectInlineMockAssignments(tempRoot);
    expect(mutant.inlineCanonicalMockAssignmentCount).toBe(9);
    expect(mutant.filesWithAssignments).toHaveLength(1);
  });

  it('keeps the preload mock helper aligned with the IPC manifest API surface', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src/shared/ipc/ipc.manifest.json'), 'utf8')
    );
    const helperSource = fs.readFileSync(
      path.join(process.cwd(), 'tests/support/mocks/preload-api-globals.js'),
      'utf8'
    );
    const manifestApiNames = manifest.namespaces.map((namespace) => namespace.apiName).sort();

    expect([...PRELOAD_API_NAMES].sort()).toEqual(manifestApiNames);
    expect(helperSource).toContain("from '@shared/ipc/ipc.manifest.json'");
    expect(helperSource).not.toMatch(/PRELOAD_API_NAMES\s*=\s*\[/);
  });

  it('reports no renderer backend implementation reintroduction', () => {
    const baseline = collectRendererBackendImplementationMetrics(process.cwd());
    expect(baseline.implementationViolationCount).toBe(0);
  });

  it('detects renderer backend implementation and legacy path reintroductions', () => {
    const backendPath = 'src/renderer/infrastructure/services/streaming/canvas-renderer.ts';
    const cases = [
      {
        prefix: 'prismgb-scorecard-renderer-backend-',
        files: {
          'src/renderer/infrastructure/rendering/my-webgpu-engine.ts': 'export class WebGPUEngine {}\n'
        },
        expected: {
          file: 'src/renderer/infrastructure/rendering/my-webgpu-engine.ts',
          reason: 'backend implementation filename leaked into rendering layer: my-webgpu-engine.ts'
        }
      },
      {
        prefix: 'prismgb-scorecard-renderer-shaders-',
        files: {
          'src/renderer/infrastructure/rendering/shaders/.gitkeep': ''
        },
        expected: {
          file: 'src/renderer/infrastructure/rendering/shaders',
          reason: 'legacy renderer backend path exists: src/renderer/infrastructure/rendering/shaders'
        }
      },
      {
        prefix: 'prismgb-scorecard-renderer-canvas-backend-',
        files: {
          [backendPath]: 'export class StreamingCanvasRenderer {}\n'
        },
        expected: {
          file: backendPath,
          reason: `legacy renderer backend path exists: ${backendPath}`
        }
      }
    ];

    cases.forEach(({ prefix, files, expected }) => {
      const metrics = collectRendererBackendImplementationMetrics(createTempProject(prefix, files));
      expect(metrics.implementationViolationCount).toBe(1);
      expect(metrics.implementationViolationFiles).toEqual([expected]);
    });
  });

  it('reports no render-pass manifest ownership drift in current package/runtime sources', () => {
    const baseline = collectRenderPassManifestOwnershipMetrics(process.cwd());
    expect(baseline.violationCount).toBe(0);
  });

  it('detects undeclared package shader files and hand-coded pass ownership outside manifest helpers', () => {
    const manifestPath = 'packages/prismgb-gpu/src/domain/render-passes/render-passes.contract.json';
    const tempRoot = createTempProject('prismgb-scorecard-render-pass-', {
      [manifestPath]: JSON.stringify({
        version: 1,
        mode: 'enforced',
        passes: [
          {
            id: 'pixel-upscale',
            webgpuShader: 'pixel-upscale.wgsl',
            webgl2FragmentShader: 'pixel-upscale.frag.glsl',
            webgl2VertexShader: 'common.vert.glsl'
          }
        ],
        utilityShaders: [{ file: 'common.vert.glsl' }]
      }),
      'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/pixel-upscale.wgsl': 'expected',
      'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/rogue-pass.wgsl': 'unexpected',
      'packages/prismgb-gpu/src/infrastructure/webgl2/shaders/pixel-upscale.frag.glsl': 'expected',
      'packages/prismgb-gpu/src/infrastructure/webgl2/shaders/common.vert.glsl': 'expected',
      'src/renderer/infrastructure/rendering/pass-list.ts': "export const passIds = ['pixel-upscale'];\nexport const shaderFile = 'pixel-upscale.wgsl';\n"
    });

    const metrics = collectRenderPassManifestOwnershipMetrics(tempRoot);

    expect(metrics.violationCount).toBe(3);
    expect(metrics.violations).toEqual(expect.arrayContaining([
      {
        file: 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/rogue-pass.wgsl',
        reason: 'package shader file is not declared by the render-pass manifest'
      },
      {
        file: 'src/renderer/infrastructure/rendering/pass-list.ts',
        line: 1,
        reason: 'render pass id "pixel-upscale" is hand-coded outside the render-pass manifest/helpers'
      },
      {
        file: 'src/renderer/infrastructure/rendering/pass-list.ts',
        line: 2,
        reason: 'render pass shader (webgpuShader) "pixel-upscale.wgsl" is hand-coded outside the render-pass manifest/helpers'
      }
    ]));
  });

  it('reports runtime JS + d.ts twin count and catches additions', () => {
    const baseline = collectRuntimeTwinMetrics(process.cwd());
    expect(baseline.pairCount).toBe(0);

    const tempRoot = createTempProject('prismgb-scorecard-twins-', {
      'src/shared/base.class.js': 'module.exports = {}',
      'src/shared/base.class.d.ts': 'export {};'
    });
    const mutant = collectRuntimeTwinMetrics(tempRoot);
    expect(mutant.pairCount).toBe(1);
  });

  it('ratchets source runtime JS file count against unchecked additions', () => {
    const baseline = collectSourceRuntimeJsMetrics(process.cwd());
    expect(baseline.fileCount).toBe(59);
    expect(baseline.files).toContain('src/renderer/presentation/icons/icon.utils.js');

    const tempRoot = createTempProject('prismgb-scorecard-runtime-js-', {
      'src/main/new-runtime.js': 'export {};\n',
      'src/main/typed.ts': 'export {};\n'
    });

    const mutant = collectSourceRuntimeJsMetrics(tempRoot);
    expect(mutant).toEqual({
      fileCount: 1,
      files: ['src/main/new-runtime.js']
    });
  });

  it('reports no retired HideTimer files or references', () => {
    const baseline = collectRetiredHideTimerMetrics(process.cwd());
    expect(baseline.violationCount).toBe(0);
    expect(baseline.violations).toEqual([]);
  });

  it('detects retired HideTimer file and reference reintroduction', () => {
    const tempRoot = createTempProject('prismgb-scorecard-hide-timer-', {
      'src/renderer/presentation/primitives/hide-timer.class.js': 'export {};\n',
      'tests/unit/ui/primitives/hide-timer.test.js': 'export {};\n',
      'src/renderer/presentation/effects/legacy-reference.ts': 'const HideTimer = null;\nvoid HideTimer;\n',
      'src/renderer/presentation/effects/legacy-import.ts': "import '../primitives/hide-timer.class.js';\n",
      'tests/unit/features/notes/ui/legacy-reference.test.js': 'const HideTimer = null;\nvoid HideTimer;\n',
      'tests/unit/renderer/presentation/primitives/legacy-import.test.ts': "import './hide-timer.class.js';\n"
    });

    const mutant = collectRetiredHideTimerMetrics(tempRoot);
    expect(mutant.violationCount).toBe(6);
    expect(mutant.violations).toEqual(expect.arrayContaining([
      {
        file: 'src/renderer/presentation/primitives/hide-timer.class.js',
        reason: 'retired file exists: src/renderer/presentation/primitives/hide-timer.class.js'
      },
      {
        file: 'tests/unit/ui/primitives/hide-timer.test.js',
        reason: 'retired file exists: tests/unit/ui/primitives/hide-timer.test.js'
      },
      expect.objectContaining({
        file: 'src/renderer/presentation/effects/legacy-reference.ts',
        reason: 'retired HideTimer reference (HideTimer identifier reference)'
      }),
      expect.objectContaining({
        file: 'src/renderer/presentation/effects/legacy-import.ts',
        reason: 'retired HideTimer reference (hide-timer module/path reference)'
      }),
      expect.objectContaining({
        file: 'tests/unit/features/notes/ui/legacy-reference.test.js',
        reason: 'retired HideTimer reference (HideTimer identifier reference)'
      }),
      expect.objectContaining({
        file: 'tests/unit/renderer/presentation/primitives/legacy-import.test.ts',
        reason: 'retired HideTimer reference (hide-timer module/path reference)'
      })
    ]));
  });

  it('reports no shared base/interface JS or d.ts cutover leftovers', () => {
    const baseline = collectSharedTypeScriptCutoverMetrics(process.cwd());
    expect(baseline.fileCount).toBe(0);

    const tempRoot = createTempProject('prismgb-scorecard-shared-cutover-', {
      'src/shared/base/listener.js': 'export {}',
      'src/shared/interfaces/service.d.ts': 'export {};'
    });

    const mutant = collectSharedTypeScriptCutoverMetrics(tempRoot);
    expect(mutant).toEqual({
      fileCount: 2,
      files: [
        'src/shared/base/listener.js',
        'src/shared/interfaces/service.d.ts'
      ]
    });
  });

  it('detects shader duplicate divergence introduced by mismatched copies', () => {
    const baseline = collectShaderDuplicateMetrics(process.cwd());
    expect(baseline.divergentPairCount).toBe(0);
    expect(baseline.duplicateFileCount).toBe(0);

    const tempRoot = createTempProject('prismgb-scorecard-shaders-', {
      'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/vertex-shader.wgsl': 'left',
      'src/renderer/infrastructure/rendering/shaders/webgpu/vertex-shader.wgsl': 'right',
      'packages/prismgb-gpu/src/infrastructure/webgl2/shaders/fragment-shader.frag.glsl': 'left',
      'src/renderer/infrastructure/rendering/shaders/webgl2/fragment-shader.frag.glsl': 'left'
    });

    const mutant = collectShaderDuplicateMetrics(tempRoot);
    expect(mutant.divergentPairCount).toBe(1);
    expect(mutant.duplicateFileCount).toBe(2);
  });

  it('detects synchronized renderer shader copies as duplicate ownership', () => {
    const tempRoot = createTempProject('prismgb-scorecard-shader-duplicates-', {
      'packages/prismgb-gpu/src/infrastructure/webgpu/shaders/pixel.wgsl': 'fn main() {}\n',
      'src/renderer/infrastructure/rendering/shaders/webgpu/pixel.wgsl': 'fn main() {}\n'
    });

    const mutant = collectShaderDuplicateMetrics(tempRoot);
    expect(mutant.divergentPairCount).toBe(0);
    expect(mutant.duplicateFileCount).toBe(1);
  });

  it('reports no alias/platform manifest drift for current architecture', () => {
    const aliasMetrics = collectAliasDriftMetrics(process.cwd());
    const platformMetrics = collectPlatformDriftMetrics(process.cwd());

    expect(aliasMetrics.driftCount).toBe(0);
    expect(platformMetrics.driftCount).toBe(0);
  });

  it('detects alias drift in each config source instead of masking drift through unioning', () => {
    const tsconfig = {
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
          '@shared/*': ['./src/shared/*']
        }
      }
    };
    const tempRoot = createTempProject('prismgb-scorecard-alias-drift-', {
      'scripts/manifests/architecture.manifest.json': JSON.stringify({
        aliases: [{ id: '@' }, { id: '@shared' }, { id: 'url' }]
      }),
      'tsconfig.base.json': JSON.stringify(tsconfig),
      'tsconfig.app.json': JSON.stringify(tsconfig),
      'vite.config.js': "export default { resolve: { alias: { '@': '/src', '@extra': '/src/extra', 'url': 'url/' } } };\n",
      'vitest.config.js': "export default { resolve: { alias: { '@': '/src', '@shared': '/src/shared' } } };\n"
    });

    const metrics = collectAliasDriftMetrics(tempRoot);

    expect(metrics.driftCount).toBe(2);
    expect(metrics.manifestMissing).toContainEqual({
      source: 'vite.config.js',
      alias: '@shared'
    });
    expect(metrics.manifestExtras).toContainEqual({
      source: 'vite.config.js',
      alias: '@extra'
    });
  });

  it('detects platform drift in both release and smoke build matrices', () => {
    const tempRoot = createTempProject('prismgb-scorecard-platform-drift-', {
      'scripts/manifests/platforms.manifest.json': JSON.stringify({
        platforms: [{ label: 'linux-x64' }, { label: 'windows-x64' }]
      }),
      'scripts/ci/build-matrix.mjs': [
        "const mode = process.argv[process.argv.indexOf('--mode') + 1];",
        "const release = [{ label: 'linux-x64' }, { label: 'windows-x64' }];",
        "const smoke = [{ label: 'linux-x64' }];",
        "process.stdout.write(JSON.stringify(mode === 'smoke' ? smoke : release));"
      ].join('\n')
    });

    const metrics = collectPlatformDriftMetrics(tempRoot);

    expect(metrics.driftCount).toBe(1);
    expect(metrics.manifestMissing).toContainEqual({
      source: 'smoke',
      label: 'windows-x64'
    });
  });
});
