/**
 * GPU platform-module boundary gate.
 *
 * Verifies the GPU module's public entrypoint surface against the workspace
 * alias registry, root-safe source exports, and the absence of deep or
 * worker imports from app and test code. Deep specifiers also fail at
 * resolution because the registry emits exact-match aliases only; this gate
 * is the explicit, named tripwire until dependency-cruiser absorbs it in P4.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_MODULES, platformTsconfigPaths } from './lib/workspace-aliases.mjs';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GPU_MODULE_DIR = resolve(PROJECT_ROOT, 'src/platform/gpu');
const GPU_TESTS_DIR = resolve(PROJECT_ROOT, 'tests/unit/platform/gpu');

const EXPECTED_GPU_ENTRYPOINTS = ['.', './runtime'];

const FORBIDDEN_IMPORT_TOKENS = [
  'packages/prismgb-gpu/src',
  '@prismgb/gpu',
  '@prismgb/gpu/src',
  '@platform/gpu/src',
  '@prismgb/gpu/worker',
  '@platform/gpu/worker',
  '@prismgb/gpu/worker-entry',
  '@platform/gpu/worker-entry'
];

const TEXT_FILE_EXTENSIONS = new Set(['.cjs', '.css', '.js', '.json', '.jsx', '.md', '.mjs', '.ts', '.tsx']);

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

function assertRegistryGpuEntrypoints() {
  const gpuModule = PLATFORM_MODULES.find((module) => module.name === 'gpu');
  if (!gpuModule) {
    fail('workspace alias registry does not declare a gpu module');
  }
  const actual = Object.keys(gpuModule.entrypoints).sort();
  const expected = [...EXPECTED_GPU_ENTRYPOINTS].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail('unexpected gpu entrypoints in the workspace alias registry', [
      `expected: ${expected.join(', ')}`,
      `actual: ${actual.join(', ')}`
    ]);
  }
}

function assertTsconfigMatchesRegistry() {
  const config = readJson('tsconfig.base.json');
  const paths = config.compilerOptions?.paths ?? {};
  const expectedGpuPaths = Object.fromEntries(
    Object.entries(platformTsconfigPaths()).filter(([alias]) => alias.startsWith('@platform/gpu'))
  );
  const actualGpuPaths = Object.fromEntries(
    Object.entries(paths).filter(([alias]) => alias.startsWith('@platform/gpu'))
  );
  if (JSON.stringify(actualGpuPaths) !== JSON.stringify(expectedGpuPaths)) {
    fail('tsconfig.base.json gpu aliases drifted from the workspace alias registry', [
      `expected: ${JSON.stringify(expectedGpuPaths)}`,
      `actual: ${JSON.stringify(actualGpuPaths)}`
    ]);
  }
  const wildcardGpuAliases = Object.keys(paths).filter(
    (alias) => alias.includes('gpu') && alias.includes('*')
  );
  if (wildcardGpuAliases.length > 0) {
    fail('tsconfig.base.json must not declare wildcard gpu aliases', wildcardGpuAliases);
  }
}

function assertResolverConfigsConsumeRegistry() {
  for (const configFile of ['vite.config.js', 'vitest.config.js']) {
    const configText = readFileSync(resolve(PROJECT_ROOT, configFile), 'utf8');
    if (!configText.includes('workspace-aliases.mjs')) {
      fail(`${configFile} does not consume scripts/lib/workspace-aliases.mjs`);
    }
  }
}

function walkFiles(root, files = []) {
  if (!existsSync(root)) {
    return files;
  }
  for (const entry of readdirSync(root)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const absolutePath = join(root, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      walkFiles(absolutePath, files);
    } else if (TEXT_FILE_EXTENSIONS.has(extname(entry))) {
      files.push(absolutePath);
    }
  }
  return files;
}

function assertRootSourceSafe() {
  const rootSource = readFileSync(resolve(GPU_MODULE_DIR, 'index.ts'), 'utf8');
  const forbidden = [
    './infrastructure',
    './application/renderer.service',
    './worker',
    './worker-entry'
  ].filter((pathName) => rootSource.includes(pathName));
  if (forbidden.length > 0) {
    fail('gpu module root exports or imports forbidden internal modules', forbidden);
  }
}

function assertNoForbiddenGpuImports() {
  const scanRoots = [resolve(PROJECT_ROOT, 'src'), resolve(PROJECT_ROOT, 'tests')];
  const failures = [];
  for (const filePath of scanRoots.flatMap((root) => walkFiles(root))) {
    if (filePath.startsWith(GPU_MODULE_DIR) || filePath.startsWith(GPU_TESTS_DIR)) {
      continue;
    }
    const text = readFileSync(filePath, 'utf8');
    const relativePath = normalizeSlash(relative(PROJECT_ROOT, filePath));
    for (const token of FORBIDDEN_IMPORT_TOKENS) {
      if (text.includes(token)) {
        failures.push(`${relativePath}: references ${token}`);
      }
    }
  }
  if (failures.length > 0) {
    fail('app/test files have invalid GPU module imports', failures);
  }
}

function assertNoWebGL2FilesIfWebGL2Removed() {
  const hasWebGL2Renderer = existsSync(resolve(GPU_MODULE_DIR, 'infrastructure/webgl.renderer.ts'));
  if (hasWebGL2Renderer) {
    return;
  }
  const files = [...walkFiles(GPU_MODULE_DIR), ...walkFiles(GPU_TESTS_DIR)];
  const webglFiles = files
    .map((filePath) => normalizeSlash(relative(PROJECT_ROOT, filePath)))
    .filter((pathName) => pathName.includes('webgl') || pathName.includes('WebGL'));
  if (webglFiles.length > 0) {
    fail('WebGL2 files remain after removal phase', webglFiles);
  }
}

assertRegistryGpuEntrypoints();
assertTsconfigMatchesRegistry();
assertResolverConfigsConsumeRegistry();
assertRootSourceSafe();
assertNoForbiddenGpuImports();
assertNoWebGL2FilesIfWebGL2Removed();

console.log('GPU boundary check OK.');
