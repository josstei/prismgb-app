import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATED_PATHS } from '../../../scripts/clean-generated.js';

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

describe('Phase 4 clean-break enforcement', () => {
  it('records Phase 4 as current delivered work instead of future work', () => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');

    expect(implementationPlan).toContain('Phase 4 delivered');
    expect(implementationPlan).toContain('Verification for Phase 4');
    expect(implementationPlan).not.toContain('Next phase when resumed: Phase 4');
  });

  it('keeps generated artifact ownership on current ignored paths without legacy coverage cleanup', () => {
    const gitignore = readProjectFile('.gitignore');
    const sizeReport = readProjectFile('scripts/codebase-size-report.js');

    expect(GENERATED_PATHS).toContain('artifacts/coverage');
    expect(GENERATED_PATHS).not.toContain('tests/coverage');
    expect(gitignore).toContain('artifacts/');
    expect(gitignore).not.toContain('tests/coverage/');
    expect(sizeReport).not.toContain("'tests/coverage'");
  });

  it('enforces every Phase 4 architecture ownership ratchet', () => {
    const thresholds = readProjectJson('scripts/architecture-thresholds.json');

    expect(thresholds.mode).toBe('enforce');
    expect(thresholds.limits).toMatchObject({
      unexpectedContractFileCountMax: 0,
      shaderDuplicateDivergenceCountMax: 0,
      shaderDuplicateFileCountMax: 0,
      runtimeJsDtsTwinCountMax: 0,
      sharedBaseInterfaceJsOrDtsFileCountMax: 0,
      inlineCanonicalMockAssignmentCountMax: 0,
      rendererBackendImplementationViolationCountMax: 0,
      aliasManifestDriftCountMax: 0,
      platformManifestDriftCountMax: 0
    });
  });

  it('keeps type and coverage debt ratchets owned and expiring', () => {
    const typeDebt = readProjectJson('scripts/type-debt-allowlist.json');
    const coverageThresholds = readProjectJson('scripts/coverage-thresholds.json');
    const sizeThresholds = readProjectJson('scripts/codebase-size-thresholds.json');
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
    expect(packageJson.scripts['release:preflight']).toContain('codebase:size -- --enforce-thresholds');
  });

  it('keeps asset module typings current without legacy shim naming', () => {
    expect(fs.existsSync(projectPath('src/types/legacy-js-modules.d.ts'))).toBe(false);
    expect(fs.existsSync(projectPath('src/types/asset-modules.d.ts'))).toBe(true);

    const assetModules = readProjectFile('src/types/asset-modules.d.ts');

    expect(assetModules).toContain("declare module '*.svg?raw'");
    expect(assetModules).not.toMatch(/legacy|compat/i);
  });

  it('keeps migrated registry surfaces free of mutable compatibility aliases', () => {
    const deviceRegistrySource = readProjectFile('src/shared/features/devices/device.registry.js');
    const typedRegistrySource = readProjectFile('src/shared/registry/typed-registry.factory.ts');

    expect(deviceRegistrySource).not.toMatch(/\bDEVICE_REGISTRY\b/);
    expect(typedRegistrySource).not.toMatch(/getValueMap|getMetadataMap|getFactoryMap/);
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
});
