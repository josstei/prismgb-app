import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PERFORMANCE_BUILD_MANIFEST = 'performance-build-manifest.json';
const PERFORMANCE_COMMAND_LEDGER = 'performance-command-ledger.json';

export const PERFORMANCE_BUILD_VARIANTS = Object.freeze([
  Object.freeze({ id: 'production', harness: false, instrumentation: false }),
  Object.freeze({ id: 'harness-control', harness: true, instrumentation: false }),
  Object.freeze({ id: 'instrumented', harness: true, instrumentation: true })
]);

function fail(message) {
  throw new Error(`Performance baseline runner failed: ${message}`);
}

function compareCodeUnitStrings(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function normalizeRelativePath(value) {
  const normalized = value.replaceAll(path.sep, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    fail(`invalid bundle path ${value}`);
  }
  return normalized;
}

function npmCommand(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function commandOutput(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
}

function readCommandOutput(result, label) {
  if (result.error) {
    fail(`${label} could not start: ${result.error.message}`);
  }
  const stdout = commandOutput(result.stdout);
  const stderr = commandOutput(result.stderr);
  if (result.status !== 0) {
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    fail(`${label} exited ${result.status}${output ? `:\n${output}` : ''}`);
  }
  return stdout;
}

function runCommand(command, args, { cwd, env, spawn = spawnSync }) {
  const result = spawn(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true
  });
  return readCommandOutput(result, `${command} ${args.join(' ')}`);
}

function monotonicSeconds() {
  return performance.now() / 1000;
}

function readClock(clock) {
  const value = clock();
  if (!Number.isFinite(value) || value < 0) fail('clock must return a nonnegative finite number of seconds');
  return value;
}

function cloneCommandLedgerEntry(entry) {
  return Object.freeze({
    ...entry,
    closure: Object.freeze({
      ...entry.closure,
      exit: Object.freeze({ ...entry.closure.exit })
    })
  });
}

/**
 * @param {{ sourceSha: string, clock?: () => number }} options
 */
export function createPerformanceCommandLedger({ sourceSha, clock = monotonicSeconds } = {}) {
  if (typeof sourceSha !== 'string' || !/^[a-f0-9]{40}$/i.test(sourceSha)) {
    fail('command ledger sourceSha must be a Git commit SHA');
  }
  if (typeof clock !== 'function') fail('command ledger clock must be a function');

  const entries = [];
  let previousEnd = 0;
  let recording = false;

  return Object.freeze({
    async recordBuild(buildId, work) {
      if (typeof buildId !== 'string' || buildId.length === 0) fail('command ledger buildId must be nonempty');
      if (typeof work !== 'function') fail('command ledger build work must be a function');
      if (recording) fail('command ledger cannot record overlapping commands');
      const start = readClock(clock);
      if (start < previousEnd) fail('command ledger clock regressed before a build command');
      recording = true;
      try {
        const value = await work();
        const end = readClock(clock);
        if (end < start) fail('command ledger clock regressed during a build command');
        const entry = Object.freeze({
          sequence: entries.length + 1,
          operationId: 'build-spawn',
          start,
          end,
          buildId,
          closure: Object.freeze({
            closed: true,
            stdoutDrained: true,
            stderrDrained: true,
            inputClosed: true,
            exit: Object.freeze({ code: 0, durationMs: (end - start) * 1000 }),
            zeroSurvivors: true
          })
        });
        entries.push(entry);
        previousEnd = end;
        return value;
      } finally {
        recording = false;
      }
    },

    snapshot() {
      return Object.freeze({
        schemaVersion: 1,
        sourceSha: sourceSha.toLowerCase(),
        entries: Object.freeze(entries.map(cloneCommandLedgerEntry))
      });
    }
  });
}

function parseRole(value) {
  if (value === 'ci-integrity' || value === 'reference-comparison') {
    return value;
  }
  fail(`unsupported experiment role ${value}`);
}

export function parsePerformanceBaselineArgs(argv, { cwd = PROJECT_ROOT } = {}) {
  if (!Array.isArray(argv)) fail('argv must be an array');

  let outputDirectory = null;
  let role = null;
  let selectedHost = false;
  let buildOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output') {
      const value = argv[++index];
      if (typeof value !== 'string' || value.length === 0) fail('--output requires a directory');
      outputDirectory = path.resolve(cwd, value);
      continue;
    }
    if (argument === '--role') {
      role = parseRole(argv[++index]);
      continue;
    }
    if (argument === '--selected-host') {
      selectedHost = true;
      continue;
    }
    if (argument === '--build-only') {
      buildOnly = true;
      continue;
    }
    fail(`unknown argument ${argument}`);
  }

  if (outputDirectory === null) fail('--output is required');
  if (outputDirectory === path.resolve(cwd)) fail('--output cannot be the repository root');
  if (role === null) fail('--role is required');
  if (role === 'reference-comparison' && !selectedHost) {
    fail('reference-comparison requires --selected-host');
  }
  if (role === 'ci-integrity' && selectedHost) {
    fail('--selected-host is only valid for reference-comparison');
  }

  return Object.freeze({ outputDirectory, role, selectedHost, buildOnly });
}

export function createPerformanceBuildEnvironment(baseEnvironment, variant) {
  if (!PERFORMANCE_BUILD_VARIANTS.includes(variant)) {
    fail('build variant is not registered');
  }
  return Object.freeze({
    ...baseEnvironment,
    PRISMGB_PERF_HARNESS_BUILD: variant.harness ? '1' : '0',
    PRISMGB_PERF_INSTRUMENTATION_BUILD: variant.instrumentation ? '1' : '0'
  });
}

async function walkBundle(root, directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => compareCodeUnitStrings(left.name, right.name))) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkBundle(root, absolutePath));
      continue;
    }
    if (!entry.isFile()) {
      fail(`bundle contains unsupported entry ${path.relative(root, absolutePath)}`);
    }
    files.push(absolutePath);
  }
  return files;
}

export async function createBundleManifest(directory) {
  const files = await walkBundle(directory);
  const entries = [];
  for (const absolutePath of files) {
    const relativePath = normalizeRelativePath(path.relative(directory, absolutePath));
    const bytes = await fs.readFile(absolutePath);
    entries.push(Object.freeze({
      path: relativePath,
      bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex')
    }));
  }
  entries.sort((left, right) => compareCodeUnitStrings(left.path, right.path));
  return Object.freeze({
    sha256: crypto.createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    entries: Object.freeze(entries)
  });
}

async function assertBuiltVariant(distDirectory) {
  const requiredPaths = [
    'main/index.js',
    'preload/index.js',
    'renderer'
  ];
  for (const relativePath of requiredPaths) {
    try {
      await fs.access(path.join(distDirectory, relativePath));
    } catch {
      fail(`build did not produce dist/${relativePath}`);
    }
  }
}

async function createEmptyOutputDirectory(outputDirectory) {
  await fs.mkdir(outputDirectory, { recursive: true });
  const existing = await fs.readdir(outputDirectory);
  if (existing.length > 0) {
    fail(`output directory must be empty: ${outputDirectory}`);
  }
}

function readCleanSourceSha({ cwd, env, spawn }) {
  const sourceStatus = runCommand('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd,
    env,
    spawn
  });
  if (sourceStatus.trim() !== '') {
    fail('source tree must be clean before creating a performance baseline');
  }

  const sourceSha = runCommand('git', ['rev-parse', 'HEAD'], {
    cwd,
    env,
    spawn
  }).trim();
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) fail('git did not return a commit SHA');
  return sourceSha.toLowerCase();
}

export async function buildPerformanceVariants({
  cwd = PROJECT_ROOT,
  outputDirectory,
  baseEnvironment = process.env,
  spawn = spawnSync,
  platform = process.platform,
  clock = monotonicSeconds
} = {}) {
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    fail('outputDirectory is required');
  }

  const sourceSha = readCleanSourceSha({
    cwd,
    env: baseEnvironment,
    spawn
  });
  await createEmptyOutputDirectory(outputDirectory);

  const distDirectory = path.join(cwd, 'dist');
  const buildsDirectory = path.join(outputDirectory, 'builds');
  await fs.mkdir(buildsDirectory, { recursive: true });
  const commandLedger = createPerformanceCommandLedger({ sourceSha, clock });
  const variants = [];

  for (const variant of PERFORMANCE_BUILD_VARIANTS) {
    await fs.rm(distDirectory, { recursive: true, force: true });
    const environment = createPerformanceBuildEnvironment(baseEnvironment, variant);
    await commandLedger.recordBuild(variant.id, () => runCommand(npmCommand(platform), ['run', 'build:vite'], {
      cwd,
      env: environment,
      spawn
    }));
    await assertBuiltVariant(distDirectory);

    const buildDirectory = path.join(buildsDirectory, variant.id);
    await fs.cp(distDirectory, buildDirectory, { recursive: true, force: false, errorOnExist: true });
    const bundle = await createBundleManifest(buildDirectory);
    variants.push(Object.freeze({
      id: variant.id,
      harness: variant.harness,
      instrumentation: variant.instrumentation,
      bundle
    }));
  }

  const manifest = Object.freeze({
    schemaVersion: 1,
    sourceSha,
    variants: Object.freeze(variants)
  });
  const manifestPath = path.join(outputDirectory, PERFORMANCE_BUILD_MANIFEST);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const commandLedgerPath = path.join(outputDirectory, PERFORMANCE_COMMAND_LEDGER);
  const commandLedgerSnapshot = commandLedger.snapshot();
  await fs.writeFile(commandLedgerPath, `${JSON.stringify(commandLedgerSnapshot, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({
    manifest,
    manifestPath,
    buildsDirectory,
    commandLedger: commandLedgerSnapshot,
    commandLedgerPath
  });
}

export async function runPerformanceBaseline({
  cwd = PROJECT_ROOT,
  argv = process.argv.slice(2),
  baseEnvironment = process.env,
  spawn = spawnSync,
  platform = process.platform,
  clock = monotonicSeconds
} = {}) {
  const options = parsePerformanceBaselineArgs(argv, { cwd });
  const build = await buildPerformanceVariants({
    cwd,
    outputDirectory: options.outputDirectory,
    baseEnvironment,
    spawn,
    platform,
    clock
  });

  if (options.buildOnly) {
    return Object.freeze({
      ...build,
      role: options.role,
      selectedHost: options.selectedHost,
      playwrightExecuted: false
    });
  }

  runCommand('npx', ['playwright', 'test', '--config', 'playwright.performance.config.js'], {
    cwd,
    env: {
      ...baseEnvironment,
      PRISMGB_PERFORMANCE_BUILD_MANIFEST: build.manifestPath,
      PRISMGB_PERFORMANCE_BUILDS_DIRECTORY: build.buildsDirectory,
      PRISMGB_PERFORMANCE_OUTPUT: options.outputDirectory,
      PRISMGB_PERFORMANCE_ROLE: options.role,
      PRISMGB_PERF_SELECTED_HOST: options.selectedHost ? '1' : '0'
    },
    spawn
  });

  return Object.freeze({
    ...build,
    role: options.role,
    selectedHost: options.selectedHost,
    playwrightExecuted: true
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPerformanceBaseline().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
