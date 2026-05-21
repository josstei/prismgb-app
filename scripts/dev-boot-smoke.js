#!/usr/bin/env node
/**
 * Dev Boot Smoke/Preflight
 *
 * Starts `npm run dev` and validates renderer startup output:
 * - waits for `Renderer application started successfully`
 * - fails immediately on renderer error messages
 * - fails on Awilix missing-token resolution errors
 * - fails on Vite JSON import-attribute warnings
 *
 * Intended for local preflight and CI release checks.
 */

import { exec, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_BOOT_SUCCESS_MARKER = 'Renderer application started successfully';

const FAILURE_PATTERNS = [
  {
    name: 'renderer-error',
    pattern: /\[Renderer ERROR\]/i,
    reason: 'Renderer error log output'
  },
  {
    name: 'awilix-resolution',
    pattern: /\b(?:Awilix|Missing dependency|Could not resolve|Cannot resolve|ResolutionError|Missing token)\b/i,
    reason: 'Awilix token resolution failure'
  },
  {
    name: 'vite-json-import-attribute',
    pattern: /(import-attribute|JSON.*import.*attributes?|inconsistent.*JSON imports?)/i,
    reason: 'Vite JSON import-attribute warning'
  }
];

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_GRACEFUL_SHUTDOWN_MS = 5000;

function parseOptions(argv) {
  const options = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    root: process.cwd(),
    command: 'npm',
    args: ['run', 'dev'],
    gracefulShutdownMs: DEFAULT_GRACEFUL_SHUTDOWN_MS
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--timeout-ms') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --timeout-ms value: ${argv[index + 1]}`);
      }
      options.timeoutMs = value;
      index += 1;
      continue;
    }

    if (arg === '--command') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing --command value.');
      }
      options.command = value;
      index += 1;
      continue;
    }

    if (arg === '--command-arg') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing --command-arg value.');
      }
      options.args = [value];
      index += 1;
      continue;
    }

    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing --root value.');
      }
      options.root = path.resolve(process.cwd(), value);
      index += 1;
    }
  }

  return options;
}

export function evaluateStartupChunk(chunkText) {
  const text = String(chunkText ?? '');

  for (const pattern of FAILURE_PATTERNS) {
    if (pattern.pattern.test(text)) {
      return {
        status: 'failure',
        reason: pattern.reason,
        matchedPattern: pattern.name
      };
    }
  }

  if (text.includes(DEV_BOOT_SUCCESS_MARKER)) {
    return { status: 'success', reason: 'Renderer started' };
  }

  return { status: 'continue' };
}

function createOutputCollector(limit = 5000) {
  return {
    buffer: '',
    add(text) {
      this.buffer += text;
      if (this.buffer.length > limit * 6) {
        this.buffer = this.buffer.slice(-limit * 2);
      }
      return this.buffer;
    }
  };
}

function toResult({ outcome, reason, stdout, stderr, matchedPattern }) {
  return {
    success: outcome === 'success',
    reason,
    matchedPattern,
    stdout,
    stderr
  };
}

async function waitForProcessClose(child, timeoutMs) {
  if (!child) {
    return { code: null, signal: null };
  }

  return new Promise((resolve) => {
    let settled = false;
    let code = null;
    let signal = null;

    const finalize = () => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      resolve({
        closed: true,
        code,
        signal
      });
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ closed: false, code: null, signal: 'timeout' });
        clearTimeout(timer);
      }
    }, timeoutMs);

    child.once('close', (closeCode, closeSignal) => {
      code = closeCode;
      signal = closeSignal;
      finalize();
    });
  });
}

function signalProcessGroup(pid, signal) {
  if (!pid) {
    return;
  }
  process.kill(-pid, signal);
}

async function shutdownDevProcess(child, gracefulMs = DEFAULT_GRACEFUL_SHUTDOWN_MS) {
  if (!child || typeof child.pid !== 'number') {
    return;
  }

  const platform = process.platform;
  try {
    if (platform === 'win32') {
      exec(`taskkill /pid ${child.pid} /t /f`);
    } else {
      signalProcessGroup(child.pid, 'SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      // Best effort.
    }
  }

  const closeResult = await waitForProcessClose(child, gracefulMs);
  if (!closeResult.closed) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Best effort.
    }
    await waitForProcessClose(child, Math.min(1000, gracefulMs));
  }
}

export async function runDevBootSmoke(options = {}) {
  const command = options.command || 'npm';
  const args = options.args || ['run', 'dev'];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const root = options.root || process.cwd();
  const spawnFn = options.spawn || spawn;
  const gracefulShutdownMs = options.gracefulShutdownMs ?? DEFAULT_GRACEFUL_SHUTDOWN_MS;

  const output = {
    stdout: createOutputCollector(),
    stderr: createOutputCollector()
  };

  let settled = false;
  let timeoutHandle;
  let finalResult;
  let finalizer;
  const finalResultPromise = new Promise((resolve) => {
    finalizer = resolve;
  });

  const finalize = async (status, reason, matchedPattern) => {
    if (settled) {
      return finalResult;
    }

    settled = true;
    clearTimeout(timeoutHandle);
    if (child) {
      await shutdownDevProcess(child, gracefulShutdownMs);
    }

    finalResult = toResult({
      outcome: status,
      reason,
      matchedPattern,
      stdout: output.stdout.buffer,
      stderr: output.stderr.buffer
    });

    finalizer(finalResult);
    return finalResult;
  };

  const child = spawnFn(command, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1'
    },
    detached: process.platform !== 'win32'
  });

  const onOutput = (text) => {
    const outcome = evaluateStartupChunk(text);
    if (outcome.status === 'failure') {
      finalize('failure', outcome.reason, outcome.matchedPattern).catch(() => {
        // ignore: finalizer covers best effort.
      });
      return;
    }
    if (outcome.status === 'success') {
      finalize('success', outcome.reason).catch(() => {
        // ignore
      });
    }
  };

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      const text = String(data);
      const bufferedText = output.stdout.add(text);
      console.log(text.trim());
      onOutput(bufferedText);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      const text = String(data);
      const bufferedText = output.stderr.add(text);
      console.error(text.trim());
      onOutput(bufferedText);
    });
  }

  child.once('error', (error) => {
    finalize('failure', `dev boot command failed to start: ${error.message}`).catch(() => {
      // ignore
    });
  });

  child.once('close', (code, signal) => {
    if (!settled) {
      finalize('failure', `dev boot exited early (code=${code}, signal=${signal || 'none'})`).catch(() => {
        // ignore
      });
    }
  });

  timeoutHandle = setTimeout(() => {
    finalize('failure', `timed out after ${timeoutMs}ms`).catch(() => {
      // ignore
    });
  }, timeoutMs);

  return finalResultPromise;
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseOptions(argv);
    const result = await runDevBootSmoke({
      command: options.command,
      args: options.args,
      root: options.root,
      timeoutMs: options.timeoutMs,
      gracefulShutdownMs: options.gracefulShutdownMs,
      spawn
    });

    if (result.success) {
      console.log('dev boot smoke preflight passed');
      return 0;
    }

    console.error('dev boot smoke preflight failed');
    if (result.reason) {
      console.error(`reason: ${result.reason}`);
    }
    if (result.matchedPattern) {
      console.error(`pattern: ${result.matchedPattern}`);
    }
    return 1;
  } catch (error) {
    console.error(`dev boot smoke preflight setup failed: ${error.message}`);
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then((code) => process.exit(code));
}
