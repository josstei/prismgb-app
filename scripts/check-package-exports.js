/**
 * Export smoke gate: asserts every path referenced by each workspace package's
 * `exports` map (the `import` and `types` conditions of every subpath) exists on
 * disk after a build. Catches a declared export whose target artifact the build
 * never emitted (e.g. a `./service` subpath pointing at a non-emitted dist file).
 * Run after `npm run build:packages`. Exits non-zero on any missing target.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE_NAMES = [
  'config',
  'core',
  'devices',
  'events',
  'gpu',
  'ipc',
  'notes',
  'transcode',
  'updates',
  'ui-base'
];

const EXPORT_CONDITIONS = ['import', 'types'];

const collectMissingTargets = () => {
  const missing = [];
  for (const packageName of PACKAGE_NAMES) {
    const manifestPath = resolve(PROJECT_ROOT, `packages/prismgb-${packageName}/package.json`);
    const packageDir = dirname(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const exportsMap = manifest.exports ?? {};
    for (const [subpath, conditions] of Object.entries(exportsMap)) {
      for (const condition of EXPORT_CONDITIONS) {
        const target = conditions[condition];
        if (!target) {
          continue;
        }
        if (!existsSync(resolve(packageDir, target))) {
          missing.push(`${manifest.name} "${subpath}".${condition} -> ${target}`);
        }
      }
    }
  }
  return missing;
};

const missingTargets = collectMissingTargets();
if (missingTargets.length > 0) {
  console.error('Export smoke FAILED — declared export targets missing after build:');
  for (const entry of missingTargets) {
    console.error(`  ${entry}`);
  }
  process.exit(1);
}

console.log(`Export smoke OK — all declared export targets exist for ${PACKAGE_NAMES.length} packages.`);
