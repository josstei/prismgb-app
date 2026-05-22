import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function readProjectJson(relativePath) {
  return JSON.parse(readProjectFile(relativePath));
}

describe('Phase 0-6 CI parity gates', () => {
  it('keeps the compact implementation status tied to current quality gates', () => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');

    expect(implementationPlan).toContain('Current audit note');
    expect(implementationPlan).toContain('npm run codebase:size -- --enforce-thresholds');
    expect(implementationPlan).toContain('npm run codebase:phase1 -- --json');
    expect(implementationPlan).toContain('npm run architecture:scorecard -- --enforce-thresholds');
    expect(implementationPlan).toContain('npm run lint');
    expect(implementationPlan).toContain('npm run architecture:type-debt:check');
    expect(implementationPlan).toContain('root `npm run typecheck`');
    expect(implementationPlan).toContain('Historical verification detail is intentionally summarized');
  });

  it('keeps GitHub Actions wired to the same PR lint, scorecard, and packaging ABI commands used by phase testing', () => {
    const lintWorkflow = readProjectFile('.github/workflows/reusable-ci-lint.yml');
    const testWorkflow = readProjectFile('.github/workflows/reusable-ci-tests.yml');
    const buildSmokeWorkflow = readProjectFile('.github/workflows/reusable-ci-build-smoke.yml');
    const desktopBuildWorkflow = readProjectFile('.github/workflows/reusable-build-desktop.yml');

    expect(lintWorkflow).toContain('amannn/action-semantic-pull-request');
    expect(lintWorkflow).toContain('npx commitlint --from');
    expect(lintWorkflow).toContain('--to');
    expect(testWorkflow).toContain('npm run architecture:scorecard -- --enforce-thresholds');
    expect(testWorkflow).toContain('npm run codebase:phase1 -- --json');
    expect(testWorkflow).toContain('artifacts/architecture-scorecard.json');
    expect(testWorkflow).toContain('artifacts/architecture-scorecard-summary.md');
    expect(testWorkflow).toContain('npm run coverage:ratchet');
    expect(testWorkflow).toContain('xvfb-run -a npm run dev:smoke');
    expect(testWorkflow).toContain('npm run packaging:check-native-abi');
    expect(buildSmokeWorkflow).toContain('npm run packaging:check-native-abi');
    expect(desktopBuildWorkflow).toContain('npm run packaging:check-native-abi');
  });

  it('builds fresh Vite output before the default E2E gate launches Electron', () => {
    const packageJson = readProjectJson('package.json');

    expect(packageJson.scripts['test:e2e']).toBe('npm run build:vite && npm run test:e2e:built');
    expect(packageJson.scripts['test:e2e:built']).toBe('playwright test');
    expect(packageJson.scripts['test:e2e:ui']).toContain('npm run build:vite && playwright test --ui');
    expect(packageJson.scripts['test:e2e:headed']).toContain('npm run build:vite && playwright test --headed');
    expect(packageJson.scripts['test:e2e:debug']).toContain('npm run build:vite && playwright test --debug');
    expect(readProjectFile('tests/e2e/fixtures/electron.fixture.js')).toContain(
      "path.join(projectRoot, 'dist/main/index.js')"
    );
  });
});
