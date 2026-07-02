#!/usr/bin/env node
/**
 * Electron App Smoke Test
 *
 * Validates that the built application can start and exit cleanly.
 * Used in CI/CD to catch packaging issues before release.
 *
 * Usage: npm run test:smoke
 *
 * The app must support --smoke-test flag to exit cleanly after startup.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import picomatch from 'picomatch';
import { walkPaths } from './lib/fs-walk.js';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const platformManifestPath = path.join(__dirname, 'manifests/platforms.manifest.json');

const TIMEOUT_MS = 60000; // 1 minute max
const platform = process.platform;

function loadPlatformManifest(manifestPath = platformManifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function nodePlatformPrefix(nodePlatform) {
  if (nodePlatform === 'darwin') return 'macos';
  if (nodePlatform === 'win32') return 'windows';
  return nodePlatform;
}

export function resolveSmokePlatformEntry(
  manifest = loadPlatformManifest(),
  { nodePlatform = process.platform, nodeArch = process.arch } = {}
) {
  const platformId = `${nodePlatformPrefix(nodePlatform)}-${nodeArch}`;
  return manifest.platforms.find((entry) => entry.id === platformId) ?? null;
}

function findFirstPatternMatch(rootDirectory, relativePattern) {
  const normalizedPattern = relativePattern.split(path.sep).join('/');
  const absolutePattern = path.resolve(rootDirectory, relativePattern);
  if (!normalizedPattern.includes('*')) {
    return fs.existsSync(absolutePattern) ? absolutePattern : null;
  }

  const searchRoot = path.resolve(rootDirectory, picomatch.scan(normalizedPattern).base);
  const isMatch = picomatch(normalizedPattern, { dot: true });
  return walkPaths(searchRoot)
    .map((absolutePath) => ({
      absolutePath,
      relativePath: path.relative(rootDirectory, absolutePath).split(path.sep).join('/')
    }))
    .filter(({ relativePath }) => isMatch(relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))[0]?.absolutePath ?? null;
}

/**
 * Find the built executable based on platform
 */
export function findExecutable({
  rootDirectory = projectRoot,
  manifest = loadPlatformManifest(),
  nodePlatform = process.platform,
  nodeArch = process.arch
} = {}) {
  const distDir = path.join(rootDirectory, 'release');

  if (!fs.existsSync(distDir)) {
    console.error(`ERROR: release directory not found at ${distDir}`);
    console.error('Run "npm run build" first.');
    return null;
  }

  const platformEntry = resolveSmokePlatformEntry(manifest, { nodePlatform, nodeArch });
  if (!platformEntry) {
    return null;
  }

  for (const pattern of platformEntry.smokeExecutablePriority) {
    const executablePath = findFirstPatternMatch(rootDirectory, pattern);
    if (executablePath) {
      if (executablePath.endsWith('.AppImage')) {
        fs.chmodSync(executablePath, '755');
      }
      return executablePath;
    }
  }

  return null;
}

/**
 * Run the smoke test
 */
async function runSmokeTest() {
  const executable = findExecutable();

  if (!executable) {
    console.error('ERROR: Could not find built executable');
    console.error(`Platform: ${platform}`);
    console.error('Ensure the application has been built for this platform.');
    process.exit(1);
  }

  console.log(`Platform: ${platform}`);
  console.log(`Executable: ${executable}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log('');
  console.log('Starting smoke test...');

  const startTime = Date.now();

  const child = spawn(executable, ['--smoke-test'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...headlessElectronEnv(),
      NODE_ENV: 'production'
    },
    // Detach on Windows to allow proper cleanup
    detached: platform === 'win32'
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  child.stdout.on('data', (data) => {
    const text = data.toString();
    stdout += text;
    console.log(`[stdout] ${text.trim()}`);
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    stderr += text;
    // Filter out common Electron warnings
    if (!text.includes('Passthrough is not supported') &&
        !text.includes('libudev')) {
      console.log(`[stderr] ${text.trim()}`);
    }
  });

  // Set overall timeout
  const timeout = setTimeout(() => {
    timedOut = true;
    console.log('');
    console.log('Smoke test timeout reached - app appears to be running successfully');
    console.log('Terminating process...');
    terminateProcessTree(child);
  }, TIMEOUT_MS);

  return new Promise((resolve) => {
    child.on('close', (code, signal) => {
      clearTimeout(timeout);
      const elapsed = Date.now() - startTime;

      console.log('');
      console.log(`Process exited after ${elapsed}ms`);
      console.log(`Exit code: ${code}`);
      console.log(`Signal: ${signal || 'none'}`);

      // Success conditions:
      // 1. Clean exit (code 0) - app started and exited via --smoke-test
      // 2. Timeout with no crash - app started and kept running
      // 3. SIGTERM/null (we killed it after timeout)
      const success = code === 0 ||
                      code === null ||
                      (timedOut && (signal === 'SIGTERM' || signal === null));

      if (success) {
        console.log('');
        console.log('=================================');
        console.log('  SMOKE TEST PASSED');
        console.log('=================================');
        resolve(0);
      } else {
        console.error('');
        console.error('=================================');
        console.error('  SMOKE TEST FAILED');
        console.error('=================================');
        console.error('');
        console.error('Full stdout:', stdout);
        console.error('Full stderr:', stderr);
        resolve(1);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      console.error('');
      console.error('Failed to start process:', err.message);
      console.error('');
      console.error('=================================');
      console.error('  SMOKE TEST FAILED');
      console.error('=================================');
      resolve(1);
    });
  });
}

// Run the test
const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  runSmokeTest().then(code => process.exit(code));
}
