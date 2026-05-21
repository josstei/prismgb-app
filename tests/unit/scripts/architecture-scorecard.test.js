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
  evaluateThresholds,
  parseCliArgs
} from '../../../scripts/architecture-scorecard.js';
import { PRELOAD_API_NAMES } from '../../support/mocks/preload-api-globals.js';

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
    sharedBaseInterfaceJsOrDtsFileCount: 0,
    inlineCanonicalMockAssignmentCount: 0,
    aliasManifestDriftCount: 0,
    platformManifestDriftCount: 0,
    rendererBackendImplementationViolationCount: 0,
    rendererBackendImplementationViolationFiles: [],
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
  const tempRoots = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
    }
  });

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-any-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'renderer'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'renderer', 'typed.ts'),
      'type Payload = unknown; // any comment only\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'renderer', 'loose.ts'),
      'export function loose(value: any): any { return value; }\n'
    );

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
    const limits = {
      strict: true,
      anyOccurrenceCountMax: 10,
      inlineCanonicalMockAssignmentCountMax: 0,
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      shaderDuplicateFileCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      sharedBaseInterfaceJsOrDtsFileCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(2);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual([
      'tsStrictness.strict',
      'any.occurrenceCount'
    ]);
  });

  it('fails when new ownership violations exceed thresholds', () => {
    const metrics = createMetrics({
      unexpectedContractFileCount: 1,
      shaderDuplicateDivergenceCount: 1,
      shaderDuplicateFileCount: 1,
      runtimeJsDtsTwinCount: 1,
      sharedBaseInterfaceJsOrDtsFileCount: 1,
      inlineCanonicalMockAssignmentCount: 1,
      rendererBackendImplementationViolationCount: 1,
      aliasManifestDriftCount: 1,
      platformManifestDriftCount: 1
    });
    const limits = {
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      shaderDuplicateFileCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      sharedBaseInterfaceJsOrDtsFileCountMax: 0,
      rendererBackendImplementationViolationCountMax: 0,
      inlineCanonicalMockAssignmentCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(9);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual([
      'unexpectedContractFileCount',
      'shaderDuplicateDivergenceCount',
      'shaderDuplicateFileCount',
      'runtimeJsDtsTwinCount',
      'sharedBaseInterfaceJsOrDtsFileCount',
      'inlineCanonicalMockAssignmentCount',
      'rendererBackendImplementationViolationCount',
      'aliasManifestDriftCount',
      'platformManifestDriftCount'
    ]);
  });
});

describe('phase 4 enforcement metrics', () => {
  const tempRoots = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
    }
  });

  it('reports no unexpected hand-maintained contract files in current ownership', () => {
    const metrics = collectContractMetrics(process.cwd());
    expect(metrics.totalContractLikeFiles).toBe(13);
    expect(metrics.unexpectedContractFileCount).toBe(0);
  });

  it('fails contract ownership checks when a new contract-like file appears', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-contract-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'src/shared/ipc'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src/shared/contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'src/shared/ipc/channels.json'), '{}');
    fs.writeFileSync(path.join(tempRoot, 'src/shared/contracts/custom.contract.ts'), 'export {}');

    const metrics = collectContractMetrics(tempRoot);
    expect(metrics.unexpectedContractFileCount).toBe(1);
    expect(metrics.unexpectedContractFiles).toContain('src/shared/contracts/custom.contract.ts');
  });

  it('fails contract ownership checks when stale tests/contracts files appear', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-stale-test-contract-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'tests/contracts'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'tests/contracts/event-contracts.js'), 'export const EventContracts = {};\n');

    const metrics = collectContractMetrics(tempRoot);
    expect(metrics.unexpectedContractFileCount).toBe(1);
    expect(metrics.unexpectedContractFiles).toContain('tests/contracts/event-contracts.js');
  });

  it('reports baseline inline canonical API mock assignments and detects additions', () => {
    const baseline = collectInlineMockAssignments(process.cwd());
    expect(baseline.inlineCanonicalMockAssignmentCount).toBe(0);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-mock-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'tests'), { recursive: true });
    const deviceApiReference = ['window', 'deviceAPI'].join('.');
    const metricsApiReference = ['globalThis', 'metricsAPI'].join('.');
    fs.writeFileSync(
      path.join(tempRoot, 'tests', 'adapter-mocks.test.ts'),
      `${deviceApiReference} = {}\n`
        + `delete ${deviceApiReference};\n`
        + `${metricsApiReference} = {};\n`
        + "global.window = { shellAPI: {}, gpuAPI: {} };\n"
        + "Object.assign(window, { updateAPI: {}, loginItemAPI: {} });\n"
        + "Object.defineProperty(window, 'transcodeAPI', { value: {} });\n"
        + "Object.defineProperties(globalThis.window, { windowAPI: { value: {} } });\n"
    );
    const mutant = collectInlineMockAssignments(tempRoot);
    expect(mutant.inlineCanonicalMockAssignmentCount).toBe(9);
    expect(mutant.filesWithAssignments).toHaveLength(1);
  });

  it('keeps the preload mock helper aligned with the IPC manifest API surface', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'src/shared/ipc/ipc.manifest.json'), 'utf8')
    );
    const manifestApiNames = manifest.namespaces.map((namespace) => namespace.apiName).sort();

    expect([...PRELOAD_API_NAMES].sort()).toEqual(manifestApiNames);
  });

  it('reports no renderer backend implementation reintroduction', () => {
    const baseline = collectRendererBackendImplementationMetrics(process.cwd());
    expect(baseline.implementationViolationCount).toBe(0);
  });

  it('detects renderer backend implementation reintroduction in the rendering layer', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-renderer-backend-'));
    tempRoots.push(tempRoot);

    fs.mkdirSync(path.join(tempRoot, 'src/renderer/infrastructure/rendering'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'src/renderer/infrastructure/rendering/my-webgpu-engine.ts'),
      'export class WebGPUEngine {}\n'
    );

    const metrics = collectRendererBackendImplementationMetrics(tempRoot);
    expect(metrics.implementationViolationCount).toBe(1);
    expect(metrics.implementationViolationFiles).toEqual([
      {
        file: 'src/renderer/infrastructure/rendering/my-webgpu-engine.ts',
        reason: 'backend implementation filename leaked into rendering layer: my-webgpu-engine.ts'
      }
    ]);
  });

  it('detects any shader tree returned to the renderer rendering layer', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-renderer-shaders-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders'), { recursive: true });

    const metrics = collectRendererBackendImplementationMetrics(tempRoot);
    expect(metrics.implementationViolationCount).toBe(1);
    expect(metrics.implementationViolationFiles).toEqual([
      {
        file: 'src/renderer/infrastructure/rendering/shaders',
        reason: 'legacy renderer backend path exists: src/renderer/infrastructure/rendering/shaders'
      }
    ]);
  });

  it('detects the deleted renderer-owned Canvas2D backend path', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-renderer-canvas-backend-'));
    tempRoots.push(tempRoot);
    const backendPath = 'src/renderer/infrastructure/services/streaming/canvas-renderer.ts';
    fs.mkdirSync(path.join(tempRoot, path.dirname(backendPath)), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, backendPath), 'export class StreamingCanvasRenderer {}\n');

    const metrics = collectRendererBackendImplementationMetrics(tempRoot);
    expect(metrics.implementationViolationCount).toBe(1);
    expect(metrics.implementationViolationFiles).toEqual([
      {
        file: backendPath,
        reason: `legacy renderer backend path exists: ${backendPath}`
      }
    ]);
  });

  it('reports runtime JS + d.ts twin count and catches additions', () => {
    const baseline = collectRuntimeTwinMetrics(process.cwd());
    expect(baseline.pairCount).toBe(0);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-twins-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'src/shared'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'src/shared/base.class.js'), 'module.exports = {}');
    fs.writeFileSync(path.join(tempRoot, 'src/shared/base.class.d.ts'), 'export {};');
    const mutant = collectRuntimeTwinMetrics(tempRoot);
    expect(mutant.pairCount).toBe(1);
  });

  it('reports no shared base/interface JS or d.ts cutover leftovers', () => {
    const baseline = collectSharedTypeScriptCutoverMetrics(process.cwd());
    expect(baseline.fileCount).toBe(0);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-shared-cutover-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'src/shared/base'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src/shared/interfaces'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'src/shared/base/listener.js'), 'export {}');
    fs.writeFileSync(path.join(tempRoot, 'src/shared/interfaces/service.d.ts'), 'export {};');

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

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-shaders-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgpu'), {
      recursive: true
    });

    fs.writeFileSync(
      path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders', 'vertex-shader.wgsl'),
      'left'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgpu', 'vertex-shader.wgsl'),
      'right'
    );

    fs.mkdirSync(path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgl2/shaders'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgl2'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgl2/shaders', 'fragment-shader.frag.glsl'),
      'left'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgl2', 'fragment-shader.frag.glsl'),
      'left'
    );

    const mutant = collectShaderDuplicateMetrics(tempRoot);
    expect(mutant.divergentPairCount).toBe(1);
    expect(mutant.duplicateFileCount).toBe(2);
  });

  it('detects synchronized renderer shader copies as duplicate ownership', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-shader-duplicates-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders'), {
      recursive: true
    });
    fs.mkdirSync(path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgpu'), {
      recursive: true
    });
    fs.writeFileSync(
      path.join(tempRoot, 'packages/prismgb-gpu/src/infrastructure/webgpu/shaders', 'pixel.wgsl'),
      'fn main() {}\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'src/renderer/infrastructure/rendering/shaders/webgpu', 'pixel.wgsl'),
      'fn main() {}\n'
    );

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-alias-drift-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'scripts/manifests'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'scripts/manifests/architecture.manifest.json'),
      JSON.stringify({
        aliases: [{ id: '@' }, { id: '@shared' }, { id: 'url' }]
      })
    );
    const tsconfig = {
      compilerOptions: {
        paths: {
          '@/*': ['./src/*'],
          '@shared/*': ['./src/shared/*']
        }
      }
    };
    fs.writeFileSync(path.join(tempRoot, 'tsconfig.base.json'), JSON.stringify(tsconfig));
    fs.writeFileSync(path.join(tempRoot, 'tsconfig.app.json'), JSON.stringify(tsconfig));
    fs.writeFileSync(
      path.join(tempRoot, 'vite.config.js'),
      "export default { resolve: { alias: { '@': '/src', '@extra': '/src/extra', 'url': 'url/' } } };\n"
    );
    fs.writeFileSync(
      path.join(tempRoot, 'vitest.config.js'),
      "export default { resolve: { alias: { '@': '/src', '@shared': '/src/shared' } } };\n"
    );

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
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-platform-drift-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'scripts/manifests'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'scripts/ci'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'scripts/manifests/platforms.manifest.json'),
      JSON.stringify({
        platforms: [{ label: 'linux-x64' }, { label: 'windows-x64' }]
      })
    );
    fs.writeFileSync(
      path.join(tempRoot, 'scripts/ci/build-matrix.mjs'),
      [
        "const mode = process.argv[process.argv.indexOf('--mode') + 1];",
        "const release = [{ label: 'linux-x64' }, { label: 'windows-x64' }];",
        "const smoke = [{ label: 'linux-x64' }];",
        "process.stdout.write(JSON.stringify(mode === 'smoke' ? smoke : release));"
      ].join('\n')
    );

    const metrics = collectPlatformDriftMetrics(tempRoot);

    expect(metrics.driftCount).toBe(1);
    expect(metrics.manifestMissing).toContainEqual({
      source: 'smoke',
      label: 'windows-x64'
    });
  });
});
