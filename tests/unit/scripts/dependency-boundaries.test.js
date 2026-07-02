import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_MODULES } from '../../../scripts/lib/workspace-aliases.mjs';

const projectRoot = process.cwd();
const fixtureRoot = path.join(projectRoot, 'tests/fixtures/dependency-boundaries');
const configPath = path.join(projectRoot, '.dependency-cruiser.cjs');

function resolveDepcruiseBin() {
  const manifestPath = path.join(projectRoot, 'node_modules/dependency-cruiser/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const binEntry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.depcruise;
  return path.join(projectRoot, 'node_modules/dependency-cruiser', binEntry);
}

function cruiseFixtureTree() {
  const result = spawnSync(
    process.execPath,
    [resolveDepcruiseBin(), '--config', configPath, '--output-type', 'json', 'src'],
    { cwd: fixtureRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (!result.stdout) {
    throw new Error(`depcruise produced no output: ${result.stderr}`);
  }
  const report = JSON.parse(result.stdout);
  return report.summary.violations.map((violation) => `${violation.rule.name} ${violation.from}`).sort();
}

const EXPECTED_VIOLATIONS = [
  'app-to-platform-internals src/renderer/application/platform-internal-alias.ts',
  'app-to-platform-internals src/renderer/application/platform-internal-relative.ts',
  'gpu-root-not-to-internals src/platform/gpu/index.ts',
  'main-not-to-renderer src/main/infrastructure/window.service.ts',
  'no-orphans src/renderer/lib/unused.utils.ts',
  'no-unresolvable src/renderer/application/platform-deep-alias.ts',
  'platform-not-to-app src/platform/notes/index.ts',
  'platform-notes-not-to-foreign-internals src/platform/notes/index.ts',
  'preload-isolated src/preload/index.ts',
  'renderer-bootstrap-only-from-entry src/renderer/application/bootstrap-loop.ts',
  'renderer-entry-not-imported src/renderer/presentation/views/entry-reach.ts',
  'renderer-infra-to-main-ipc-value src/renderer/infrastructure/services/router-value.ts',
  'renderer-infrastructure-not-to-presentation src/renderer/infrastructure/services/presentation-reach.ts',
  'renderer-infrastructure-not-to-presentation src/renderer/infrastructure/services/presentation-relative.ts',
  'renderer-lib-not-to-app src/renderer/lib/app-reach.ts',
  'renderer-not-to-main src/renderer/application/main-reach.ts',
  'renderer-not-to-main src/renderer/presentation/views/main-dynamic.ts',
  'renderer-not-to-main-ipc src/renderer/application/ipc-reach.ts',
  'renderer-presentation-not-to-infrastructure src/renderer/presentation/views/infra-reach.ts'
].sort();

describe('dependency boundary rules', () => {
  it('reports exactly the expected violation set for the fixture tree', () => {
    expect(cruiseFixtureTree()).toEqual(EXPECTED_VIOLATIONS);
  });
});

function listSourceEntries(relativeDirectory) {
  return fs.readdirSync(path.join(projectRoot, relativeDirectory))
    .filter((entry) => !entry.startsWith('.'))
    .sort();
}

describe('source tree structure', () => {
  it('classifies every src/ top-level family', () => {
    expect(listSourceEntries('src')).toEqual(['main', 'platform', 'preload', 'renderer', 'types']);
  });

  it('classifies every src/renderer top-level entry', () => {
    expect(listSourceEntries('src/renderer')).toEqual([
      'app-bootstrap.ts', 'application', 'assets', 'index.html', 'index.ts',
      'infrastructure', 'lib', 'presentation'
    ]);
  });

  it('classifies every src/main top-level entry', () => {
    expect(listSourceEntries('src/main'))
      .toEqual(['app-bootstrap.ts', 'application', 'index.ts', 'infrastructure', 'ipc']);
  });

  it('keeps src/platform aligned with the alias registry', () => {
    expect(listSourceEntries('src/platform'))
      .toEqual(PLATFORM_MODULES.map((platformModule) => platformModule.name).sort());
  });
});

describe('gpu module hygiene', () => {
  it('keeps the gpu module free of WebGL renderer files', () => {
    const roots = ['src/platform/gpu', 'tests/unit/platform/gpu'];
    const files = roots.flatMap((root) =>
      fs.readdirSync(path.join(projectRoot, root), { recursive: true }).map(String)
    );
    expect(files.filter((name) => name.toLowerCase().includes('webgl'))).toEqual([]);
  });
});
