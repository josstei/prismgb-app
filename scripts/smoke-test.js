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
import os from 'node:os';
import picomatch from 'picomatch';
import { walkPaths } from './lib/fs-walk.js';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const platformManifestPath = path.join(__dirname, 'manifests/platforms.manifest.json');

const TIMEOUT_MS = 60000; // 1 minute max

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

/** Require the real application and renderer to start, then exit cleanly. */
export async function runSmokeTest({
  executable = findExecutable(),
  timeoutMs = TIMEOUT_MS,
  spawnFn = spawn,
  terminate = terminateProcessTree,
  logger = console
} = {}) {
  if (!executable) {
    return { success: false, reason: 'Packaged executable not found', stdout: '', stderr: '' };
  }

  let child;
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-smoke-'));
  try {
    child = spawnFn(executable, ['--smoke-test', `--user-data-dir=${userDataDir}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...headlessElectronEnv(), NODE_ENV: 'production' },
      detached: process.platform !== 'win32'
    });
  } catch (error) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    return { success: false, reason: `Failed to start process: ${error.message}`, stdout: '', stderr: '' };
  }

  try {
    return await new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let ready = false;
      let settled = false;
      let timeout;
      const finish = async (success, reason, terminateChild = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (terminateChild) {
          await terminate(child, { killProcessGroup: true }).catch((error) => logger.error(error.message));
        }
        resolve({ success, reason, stdout, stderr });
      };

      child.stdout?.on('data', (chunk) => {
        const text = String(chunk);
        stdout += text;
        ready ||= stdout.split(/\r?\n/).includes('PRISMGB_SMOKE_READY');
        stdout = stdout.slice(-30000);
        logger.log(text.trim());
      });
      child.stderr?.on('data', (chunk) => {
        const text = String(chunk);
        stderr = (stderr + text).slice(-30000);
        logger.error(text.trim());
      });
      child.once('error', (error) => finish(false, `Failed to start process: ${error.message}`));
      child.once('close', (code, signal) => {
        const success = ready && code === 0 && signal === null;
        finish(success, success
          ? 'Application and renderer started and shut down cleanly'
          : `Application exited without a successful smoke handshake (ready=${ready}, code=${code}, signal=${signal})`);
      });
      timeout = setTimeout(() => {
        // A running or signalled process is never evidence of successful startup.
        void finish(false, `Smoke test timed out after ${timeoutMs}ms`, true);
      }, timeoutMs);
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  const result = await runSmokeTest();
  console.log(`Smoke test ${result.success ? 'passed' : 'failed'}: ${result.reason}`);
  process.exitCode = result.success ? 0 : 1;
}
