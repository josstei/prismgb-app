#!/usr/bin/env node
// Runs `npm run dev` until the renderer reports a successful start, failing fast on renderer
// errors, DI resolution errors or Vite JSON import-attribute warnings.

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';

const DEV_BOOT_SUCCESS_MARKER = 'Renderer application started successfully';
// Markers can arrive split across chunks, so each chunk is evaluated together with this much prior output.
const OUTPUT_TAIL_CHARS = 10000;

const FAILURE_PATTERNS = [
  {
    name: 'renderer-error',
    pattern: /\[Renderer ERROR\]/i,
    reason: 'Renderer error log output'
  },
  {
    name: 'di-resolution',
    pattern:
      /\b(?:Missing dependency|Could not resolve|Cannot resolve|ResolutionError|Missing token|No matching bindings found|Ambiguous match found)\b/i,
    reason: 'DI container token resolution failure'
  },
  {
    name: 'vite-json-import-attribute',
    pattern: /(import-attribute|JSON.*import.*attributes?|inconsistent.*JSON imports?)/i,
    reason: 'Vite JSON import-attribute warning'
  }
];

export function evaluateStartupChunk(text) {
  const failure = FAILURE_PATTERNS.find(({ pattern }) => pattern.test(text));
  if (failure) {
    return { status: 'failure', reason: failure.reason, matchedPattern: failure.name };
  }
  if (text.includes(DEV_BOOT_SUCCESS_MARKER)) {
    return { status: 'success', reason: 'Renderer started' };
  }
  return { status: 'continue' };
}

export function runDevBootSmoke(options = {}) {
  const { timeoutMs = 60000, gracefulShutdownMs = 5000 } = options;
  const spawnProcess = options.spawn ?? spawn;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (success, reason, matchedPattern) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      void terminateProcessTree(child, { gracefulMs: gracefulShutdownMs, killProcessGroup: true })
        .then(() => resolve({ success, reason, matchedPattern }));
    };

    const child = spawnProcess('npm', ['run', 'dev'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: headlessElectronEnv(),
      detached: process.platform !== 'win32'
    });
    const timeoutHandle = setTimeout(() => finish(false, `timed out after ${timeoutMs}ms`), timeoutMs);

    const watch = (stream, log) => {
      let tail = '';
      stream.on('data', (data) => {
        const text = String(data);
        log(text.trim());
        const recent = tail + text;
        tail = recent.slice(-OUTPUT_TAIL_CHARS);
        const outcome = evaluateStartupChunk(recent);
        if (outcome.status !== 'continue') {
          finish(outcome.status === 'success', outcome.reason, outcome.matchedPattern);
        }
      });
    };
    watch(child.stdout, console.log);
    watch(child.stderr, console.error);

    child.once('error', (error) => finish(false, `dev boot command failed to start: ${error.message}`));
    child.once('close', (code, signal) => {
      finish(false, `dev boot exited early (code=${code}, signal=${signal || 'none'})`);
    });
  });
}

async function main() {
  const result = await runDevBootSmoke();
  if (result.success) {
    console.log('dev boot smoke preflight passed');
    return 0;
  }
  console.error('dev boot smoke preflight failed');
  console.error(`reason: ${result.reason}`);
  if (result.matchedPattern) {
    console.error(`pattern: ${result.matchedPattern}`);
  }
  return 1;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(`dev boot smoke preflight setup failed: ${error.message}`);
      process.exit(1);
    }
  );
}
