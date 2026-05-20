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
  evaluateThresholds,
  parseCliArgs
} from '../../../scripts/architecture-scorecard.js';

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
    runtimeJsDtsTwinCount: 0,
    inlineCanonicalMockAssignmentCount: 0,
    aliasManifestDriftCount: 0,
    platformManifestDriftCount: 0,
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
      runtimeJsDtsTwinCountMax: 0,
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
      runtimeJsDtsTwinCount: 1,
      inlineCanonicalMockAssignmentCount: 1,
      aliasManifestDriftCount: 1,
      platformManifestDriftCount: 1
    });
    const limits = {
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      inlineCanonicalMockAssignmentCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(6);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual([
      'unexpectedContractFileCount',
      'shaderDuplicateDivergenceCount',
      'runtimeJsDtsTwinCount',
      'inlineCanonicalMockAssignmentCount',
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
      `${deviceApiReference} = {}\ndelete ${deviceApiReference};\n${metricsApiReference} = {};\n`
    );
    const mutant = collectInlineMockAssignments(tempRoot);
    expect(mutant.inlineCanonicalMockAssignmentCount).toBe(3);
    expect(mutant.filesWithAssignments).toHaveLength(1);
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

  it('detects shader duplicate divergence introduced by mismatched copies', () => {
    const baseline = collectShaderDuplicateMetrics(process.cwd());
    expect(baseline.divergentPairCount).toBe(0);

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
  });

  it('reports no alias/platform manifest drift for current architecture', () => {
    const aliasMetrics = collectAliasDriftMetrics(process.cwd());
    const platformMetrics = collectPlatformDriftMetrics(process.cwd());

    expect(aliasMetrics.driftCount).toBe(0);
    expect(platformMetrics.driftCount).toBe(0);
  });
});
