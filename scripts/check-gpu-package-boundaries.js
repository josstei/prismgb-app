/**
 * GPU package boundary gate.
 *
 * Verifies public GPU subpaths, root-safe source exports, stale artifact
 * cleanup, and source export surfaces. When package dist exists, it also
 * imports the built entrypoints to verify the runtime export surface.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GPU_PACKAGE_DIR = resolve(PROJECT_ROOT, 'packages/prismgb-gpu');

const EXPECTED_GPU_EXPORTS = ['.', './runtime', './testkit'];

const EXPECTED_GPU_ALIASES = {
  '@prismgb/gpu': './packages/prismgb-gpu/src',
  '@prismgb/gpu/runtime': './packages/prismgb-gpu/src/runtime',
  '@prismgb/gpu/testkit': './packages/prismgb-gpu/src/testkit'
};

const TEXT_FILE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx'
]);

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(PROJECT_ROOT, relativePath), 'utf8'));
}

function normalizeSlash(pathName) {
  return pathName.split('\\').join('/');
}

function fail(message, details = []) {
  console.error(`GPU boundary check FAILED: ${message}`);
  for (const detail of details) {
    console.error(`  ${detail}`);
  }
  process.exit(1);
}

function assertExactGpuExports() {
  const manifest = readJson('packages/prismgb-gpu/package.json');
  const actualExports = Object.keys(manifest.exports ?? {}).sort();
  const expectedExports = [...EXPECTED_GPU_EXPORTS].sort();

  if (JSON.stringify(actualExports) !== JSON.stringify(expectedExports)) {
    fail('unexpected @prismgb/gpu exports map', [
      `expected: ${expectedExports.join(', ')}`,
      `actual: ${actualExports.join(', ')}`
    ]);
  }
}

function assertTsconfigAliases(relativePath) {
  const config = readJson(relativePath);
  const paths = config.compilerOptions?.paths ?? {};
  const gpuAliases = Object.fromEntries(
    Object.entries(paths).filter(([alias]) => alias.startsWith('@prismgb/gpu'))
  );
  const actualAliases = Object.keys(gpuAliases).sort();
  const expectedAliases = Object.keys(EXPECTED_GPU_ALIASES).sort();

  if (JSON.stringify(actualAliases) !== JSON.stringify(expectedAliases)) {
    fail(`${relativePath} has unexpected GPU aliases`, [
      `expected: ${expectedAliases.join(', ')}`,
      `actual: ${actualAliases.join(', ')}`
    ]);
  }

  for (const [alias, expectedTarget] of Object.entries(EXPECTED_GPU_ALIASES)) {
    const targets = gpuAliases[alias] ?? [];
    if (targets.length !== 1 || targets[0] !== expectedTarget) {
      fail(`${relativePath} alias ${alias} points at the wrong target`, [
        `expected: ${expectedTarget}`,
        `actual: ${targets.join(', ')}`
      ]);
    }
  }
}

function assertVitestAliases() {
  const configText = readFileSync(resolve(PROJECT_ROOT, 'vitest.config.js'), 'utf8');
  const missing = Object.keys(EXPECTED_GPU_ALIASES).filter((alias) => !configText.includes(`'${alias}'`));
  if (missing.length > 0) {
    fail('vitest.config.js is missing explicit GPU aliases', missing);
  }
  if (configText.includes('@prismgb/gpu/*')) {
    fail('vitest.config.js must not use a wildcard GPU alias');
  }
  if (configText.includes('@prismgb/gpu/worker')) {
    fail('vitest.config.js still contains @prismgb/gpu/worker alias');
  }
}

function walkFiles(root, files = [], options = {}) {
  const skipGenerated = options.skipGenerated ?? true;
  if (!existsSync(root)) {
    return files;
  }

  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || (skipGenerated && (entry === 'dist' || entry === '.turbo'))) {
      continue;
    }

    const absolutePath = join(root, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkFiles(absolutePath, files, options);
    } else if (TEXT_FILE_EXTENSIONS.has(extname(entry))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function assertRootSourceSafe() {
  const rootSource = readFileSync(resolve(GPU_PACKAGE_DIR, 'src/index.ts'), 'utf8');
  const forbidden = [
    './infrastructure',
    './application/renderer.service',
    './worker',
    './worker-entry'
  ].filter((pathName) => rootSource.includes(pathName));

  if (forbidden.length > 0) {
    fail('@prismgb/gpu root source exports or imports forbidden internal modules', forbidden);
  }
}

function assertNoAppDeepImportsAndWorkerImports() {
  const roots = [
    resolve(PROJECT_ROOT, 'src'),
    resolve(PROJECT_ROOT, 'tests')
  ];
  const failures = [];

  for (const filePath of roots.flatMap((root) => walkFiles(root))) {
    const text = readFileSync(filePath, 'utf8');
    const relativePath = normalizeSlash(relative(PROJECT_ROOT, filePath));
    if (text.includes('packages/prismgb-gpu/src') || text.includes('@prismgb/gpu/src')) {
      failures.push(`${relativePath}: deep imports package source`);
    }
    if (text.includes('@prismgb/gpu/worker')) {
      failures.push(`${relativePath}: imports @prismgb/gpu/worker`);
    }
    if (text.includes('@prismgb/gpu/worker-entry')) {
      failures.push(`${relativePath}: imports @prismgb/gpu/worker-entry`);
    }
  }

  if (failures.length > 0) {
    fail('app/test files have invalid GPU package imports', failures);
  }
}

function assertBuiltDistMatchesExports() {
  const distDir = resolve(GPU_PACKAGE_DIR, 'dist');
  if (!existsSync(distDir)) {
    return;
  }

  const manifest = readJson('packages/prismgb-gpu/package.json');
  const exportsMap = manifest.exports ?? {};

  const allowedFiles = new Set();
  for (const [, paths] of Object.entries(exportsMap)) {
    if (paths.import) {
      allowedFiles.add(normalizeSlash(relative('./dist', paths.import)));
      allowedFiles.add(normalizeSlash(relative('./dist', paths.import)) + '.map');
    }
    if (paths.types) {
      allowedFiles.add(normalizeSlash(relative('./dist', paths.types)));
      allowedFiles.add(normalizeSlash(relative('./dist', paths.types)) + '.map');
    }
  }

  allowedFiles.add('worker-entry.js');
  allowedFiles.add('worker-entry.js.map');
  allowedFiles.add('worker-entry.d.ts');
  allowedFiles.add('worker-entry.d.ts.map');

  const filesInDist = walkFiles(distDir, [], { skipGenerated: false })
    .map(filePath => normalizeSlash(relative(distDir, filePath)));

  const unexpected = filesInDist.filter(file => !allowedFiles.has(file));
  if (unexpected.length > 0) {
    fail('built dist contains unexpected files not matching package exports plus allowed private worker asset', unexpected);
  }
}

function assertNoWebGL2FilesIfWebGL2Removed() {
  const hasWebGL2Renderer = existsSync(resolve(GPU_PACKAGE_DIR, 'src/infrastructure/webgl.renderer.ts'));
  if (hasWebGL2Renderer) {
    return;
  }

  const files = walkFiles(GPU_PACKAGE_DIR, [], { skipGenerated: false });
  const webglFiles = files
    .map(filePath => normalizeSlash(relative(PROJECT_ROOT, filePath)))
    .filter(path => path.includes('webgl') || path.includes('WebGL'));

  if (webglFiles.length > 0) {
    fail('WebGL2 files remain after removal phase', webglFiles);
  }
}

assertExactGpuExports();
assertTsconfigAliases('tsconfig.base.json');
assertTsconfigAliases('tsconfig.app.json');
assertVitestAliases();
assertRootSourceSafe();
assertNoAppDeepImportsAndWorkerImports();
assertBuiltDistMatchesExports();
assertNoWebGL2FilesIfWebGL2Removed();

console.log('GPU boundary check OK.');
