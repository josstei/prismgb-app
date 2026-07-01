/**
 * GPU package boundary gate.
 *
 * Run after `npm run build:packages`. It verifies the public GPU subpaths,
 * root-safe source and dist exports, stale artifact cleanup, and the generated
 * `@prismgb/gpu/testkit` runtime export surface.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GPU_PACKAGE_DIR = resolve(PROJECT_ROOT, 'packages/prismgb-gpu');

const EXPECTED_GPU_EXPORTS = ['.', './runtime', './worker', './worker-entry', './testkit'];
const EXPECTED_TESTKIT_EXPORTS = [
  'createMockCanvas',
  'createMockOffscreenCanvas',
  'createMockWebGL2Context',
  'createPipelineUniformsFixture',
  'createRenderCapabilitiesFixture',
  'createRenderPresetFixture',
  'createRenderStatsFixture',
  'createWorkerRendererClientMock'
];

const EXPECTED_GPU_ALIASES = {
  '@prismgb/gpu': './packages/prismgb-gpu/src',
  '@prismgb/gpu/runtime': './packages/prismgb-gpu/src/runtime',
  '@prismgb/gpu/worker': './packages/prismgb-gpu/src/worker',
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

const STALE_SOURCE_PATTERNS = [
  /\bGpuFrameBuffer\b/,
  /\bGpuFrameBufferLike\b/,
  /\bGpuWorkerManager\b/,
  /worker-protocol\.config/,
  /render\.worker/,
  /\bPresetRegistry\b/,
  /\bIPipeline\b/,
  /\bIPipelineConfig\b/,
  /\bIPipelineCapabilities\b/,
  /\bIPipelineStats\b/,
  /\bIPreset\b/,
  /\bRenderAPI\b/,
  /createGpuWorkerManagerMock/,
  /createGpuFrameBufferMock/,
  /createWorkerPipelineMock/
];

const STALE_GPU_SOURCE_PATH_PARTS = [
  'src/domain/pipeline/',
  'src/domain/shaders/',
  'src/domain/presets/preset-registry.ts',
  'src/factories/',
  'src/application/gpu-frame-buffer.ts',
  'src/infrastructure/base-pipeline.ts',
  'src/infrastructure/shader-source-map.ts',
  'src/infrastructure/webgl2/shader-program.ts',
  'src/infrastructure/webgl2/webgl2-shader-loader.ts',
  'src/infrastructure/webgpu/bind-group-cache.ts',
  'src/infrastructure/webgpu/uniform-tracker.ts',
  'src/infrastructure/webgpu/webgpu-shader-loader.ts'
];

const STALE_GPU_DIST_PATH_PARTS = [
  'dist/domain/pipeline/',
  'dist/domain/shaders/',
  'dist/domain/render-passes/render-passes-helpers',
  'dist/domain/render-passes/render-passes.contract',
  'dist/factories/',
  'dist/application/gpu-frame-buffer',
  'dist/infrastructure/base-pipeline',
  'dist/infrastructure/shader-source-map',
  'dist/infrastructure/webgl2/shader-program',
  'dist/infrastructure/webgl2/webgl2-shader-loader',
  'dist/infrastructure/webgpu/bind-group-cache',
  'dist/infrastructure/webgpu/uniform-tracker',
  'dist/infrastructure/webgpu/webgpu-shader-loader',
  'dist/assets/shader-source-map'
];

const FORBIDDEN_ROOT_SOURCE_EXPORTS = [
  './runtime',
  './worker',
  './infrastructure',
  './application/render-pipeline',
  './application/canvas2d-render-pipeline',
  './infrastructure/shader-sources',
  './infrastructure/capabilities.browser',
  './infrastructure/capabilities.worker'
];

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

function assertNoStaleSourceSymbols() {
  const roots = [
    resolve(PROJECT_ROOT, 'src'),
    resolve(PROJECT_ROOT, 'tests'),
    resolve(PROJECT_ROOT, 'packages/prismgb-gpu/src'),
    resolve(PROJECT_ROOT, 'packages/prismgb-gpu/tests')
  ];
  const failures = [];

  for (const filePath of roots.flatMap((root) => walkFiles(root))) {
    const relativePath = normalizeSlash(relative(PROJECT_ROOT, filePath));
    const text = readFileSync(filePath, 'utf8');
    for (const pattern of STALE_SOURCE_PATTERNS) {
      if (pattern.test(text)) {
        failures.push(`${relativePath}: ${pattern}`);
      }
      pattern.lastIndex = 0;
    }
  }

  if (failures.length > 0) {
    fail('stale GPU source/test symbols remain', failures);
  }
}

function assertNoStalePaths(pathParts, root = GPU_PACKAGE_DIR, options = {}) {
  const allFiles = walkFiles(root, [], options);
  const stalePaths = allFiles
    .map((filePath) => normalizeSlash(relative(GPU_PACKAGE_DIR, filePath)))
    .filter((relativePath) => pathParts.some((part) => relativePath.includes(part.replace(/^dist\//, 'dist/'))));

  if (stalePaths.length > 0) {
    fail('stale GPU files remain', stalePaths);
  }
}

function assertRootSourceSafe() {
  const rootSource = readFileSync(resolve(GPU_PACKAGE_DIR, 'src/index.ts'), 'utf8');
  const forbidden = FORBIDDEN_ROOT_SOURCE_EXPORTS.filter((pathName) => rootSource.includes(pathName));
  if (forbidden.length > 0) {
    fail('@prismgb/gpu root source exports runtime or infrastructure modules', forbidden);
  }
}

function assertNoAppDeepImports() {
  const roots = [
    resolve(PROJECT_ROOT, 'src'),
    resolve(PROJECT_ROOT, 'tests')
  ];
  const failures = [];

  for (const filePath of roots.flatMap((root) => walkFiles(root))) {
    const text = readFileSync(filePath, 'utf8');
    if (text.includes('packages/prismgb-gpu/src') || text.includes('@prismgb/gpu/src')) {
      failures.push(normalizeSlash(relative(PROJECT_ROOT, filePath)));
    }
  }

  if (failures.length > 0) {
    fail('app/test files deep-import GPU package source', failures);
  }
}

async function assertBuiltExportSurface() {
  const indexPath = resolve(GPU_PACKAGE_DIR, 'dist/index.js');
  const testkitPath = resolve(GPU_PACKAGE_DIR, 'dist/testkit.js');
  const workerPath = resolve(GPU_PACKAGE_DIR, 'dist/worker.js');
  const workerEntryPath = resolve(GPU_PACKAGE_DIR, 'dist/worker-entry.js');
  const runtimePath = resolve(GPU_PACKAGE_DIR, 'dist/runtime.js');

  for (const requiredPath of [indexPath, testkitPath, workerPath, workerEntryPath, runtimePath]) {
    if (!existsSync(requiredPath)) {
      fail('GPU dist export target is missing; run npm run build:packages first', [
        normalizeSlash(relative(PROJECT_ROOT, requiredPath))
      ]);
    }
  }

  const root = await import(pathToFileURL(indexPath).href);
  const testkit = await import(pathToFileURL(testkitPath).href);
  const worker = await import(pathToFileURL(workerPath).href);
  const runtime = await import(pathToFileURL(runtimePath).href);

  const forbiddenRootExports = [
    'WorkerRendererClient',
    'createRenderPipeline',
    'createWorkerPipeline',
    'detectBrowserGpuCapabilities'
  ].filter((name) => name in root);
  if (forbiddenRootExports.length > 0) {
    fail('@prismgb/gpu root dist export leaked runtime/worker APIs', forbiddenRootExports);
  }

  const missingTestkitExports = EXPECTED_TESTKIT_EXPORTS.filter((name) => !(name in testkit));
  if (missingTestkitExports.length > 0) {
    fail('@prismgb/gpu/testkit dist export is incomplete', missingTestkitExports);
  }

  const missingWorkerExports = ['WorkerRendererClient', 'WorkerMessageType', 'createWorkerMessage']
    .filter((name) => !(name in worker));
  if (missingWorkerExports.length > 0) {
    fail('@prismgb/gpu/worker dist export is incomplete', missingWorkerExports);
  }

  const missingRuntimeExports = ['createCanvas2DRenderPipeline', 'createRenderPipeline', 'detectBrowserGpuCapabilities']
    .filter((name) => !(name in runtime));
  if (missingRuntimeExports.length > 0) {
    fail('@prismgb/gpu/runtime dist export is incomplete', missingRuntimeExports);
  }
}

assertExactGpuExports();
assertTsconfigAliases('tsconfig.base.json');
assertTsconfigAliases('tsconfig.app.json');
assertVitestAliases();
assertNoStaleSourceSymbols();
assertNoStalePaths(STALE_GPU_SOURCE_PATH_PARTS);
assertRootSourceSafe();
assertNoAppDeepImports();
assertNoStalePaths(STALE_GPU_DIST_PATH_PARTS, GPU_PACKAGE_DIR, { skipGenerated: false });
await assertBuiltExportSurface();

console.log('GPU boundary check OK.');
