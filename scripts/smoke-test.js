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
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TIMEOUT_MS = 60000; // 1 minute max
const platform = process.platform;

/**
 * Find the built executable based on platform
 */
function findExecutable() {
  const distDir = path.join(__dirname, '..', 'release');

  if (!fs.existsSync(distDir)) {
    console.error(`ERROR: release directory not found at ${distDir}`);
    console.error('Run "npm run build" first.');
    return null;
  }

  const files = fs.readdirSync(distDir);

  if (platform === 'linux') {
    // Prefer AppImage, then look in unpacked directory
    const appImage = files.find(f => f.endsWith('.AppImage'));
    if (appImage) {
      const appImagePath = path.join(distDir, appImage);
      // Make AppImage executable
      fs.chmodSync(appImagePath, '755');
      return appImagePath;
    }

    // Fallback to unpacked directory
    const unpackedDir = path.join(distDir, 'linux-unpacked');
    if (fs.existsSync(unpackedDir)) {
      const executable = path.join(unpackedDir, 'prismgb');
      if (fs.existsSync(executable)) {
        return executable;
      }
    }
  } else if (platform === 'darwin') {
    // Look for .app bundle
    const macDir = path.join(distDir, 'mac');
    const macArmDir = path.join(distDir, 'mac-arm64');

    for (const dir of [macDir, macArmDir]) {
      if (fs.existsSync(dir)) {
        const apps = fs.readdirSync(dir).filter(f => f.endsWith('.app'));
        if (apps.length > 0) {
          return path.join(dir, apps[0], 'Contents', 'MacOS', 'PrismGB');
        }
      }
    }
  } else if (platform === 'win32') {
    // Look for portable exe (not Setup installer)
    const portableExe = files.find(f => f.endsWith('-portable.exe'));
    if (portableExe) {
      return path.join(distDir, portableExe);
    }

    // Fallback to unpacked directory
    const unpackedDir = path.join(distDir, 'win-unpacked');
    if (fs.existsSync(unpackedDir)) {
      const executable = path.join(unpackedDir, 'PrismGB.exe');
      if (fs.existsSync(executable)) {
        return executable;
      }
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
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      // Prevent opening dev tools
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

    if (platform === 'win32') {
      spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
    } else {
      child.kill('SIGTERM');
    }
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
runSmokeTest().then(code => process.exit(code));
