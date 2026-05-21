import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();

const phaseVerificationMarkers = [
  'Verification at Phase 0 commit',
  'Verification for Phase 1',
  'Verification for Phase 2',
  'Verification for Phase 3',
  'Verification for Phase 4',
  'Verification for Phase 5'
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

function extractBulletBlock(source, marker) {
  const start = source.indexOf(`- ${marker}:`);
  if (start < 0) {
    return '';
  }

  const rest = source.slice(start);
  const nextBlock = rest.slice(1).search(/\n- (?:Phase|Verification|Next phase)/);
  return nextBlock < 0 ? rest : rest.slice(0, nextBlock + 1);
}

describe('Phase 0-5 CI parity gates', () => {
  it.each(phaseVerificationMarkers)('%s includes PR lint and scorecard enforcement', (marker) => {
    const implementationPlan = readProjectFile('CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md');
    const verificationBlock = extractBulletBlock(implementationPlan, marker);

    expect(verificationBlock).toContain('semantic-pull-request');
    expect(verificationBlock).toContain('npx commitlint --from <base> --to <head> --verbose');
    expect(verificationBlock).toContain('npm run architecture:scorecard -- --enforce-thresholds');
    expect(verificationBlock).toContain('npm run packaging:check-native-abi');
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
});
