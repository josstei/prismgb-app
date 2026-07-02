#!/usr/bin/env node
/**
 * Dev Boot Smoke/Preflight
 *
 * Starts `npm run dev` and validates renderer startup output:
 * - waits for `Renderer application started successfully`
 * - fails immediately on renderer error messages
 * - fails on DI container missing-token resolution errors
 * - fails on Vite JSON import-attribute warnings
 *
 * Intended for local preflight and CI release checks.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';

const DEV_BOOT_SUCCESS_MARKER = 'Renderer application started successfully';

const FAILURE_PATTERNS = [
  {
    name: 'renderer-error',
    pattern: /\[Renderer ERROR\]/i,
    reason: 'Renderer error log output'
  },
  {
    name: 'di-resolution',
    pattern: /\b(?:Missing dependency|Could not resolve|Cannot resolve|ResolutionError|Missing token)\b/i,
    reason: 'DI container token resolution failure'
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
  const { values } = parseArgs({
    args: argv,
    options: {
      'timeout-ms': { type: 'string' },
      command: { type: 'string' },
      'command-arg': { type: 'string' },
      root: { type: 'string' }
    }
  });

  const options = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    root: values.root ? path.resolve(process.cwd(), values.root) : process.cwd(),
    command: values.command ?? 'npm',
    args: values['command-arg'] ? [values['command-arg']] : ['run', 'dev'],
    gracefulShutdownMs: DEFAULT_GRACEFUL_SHUTDOWN_MS
  };

  if (values['timeout-ms'] !== undefined) {
    const timeoutValue = Number(values['timeout-ms']);
    if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
      throw new Error(`Invalid --timeout-ms value: ${values['timeout-ms']}`);
    }
    options.timeoutMs = timeoutValue;
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
      await terminateProcessTree(child, { gracefulMs: gracefulShutdownMs, killProcessGroup: true });
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
    env: headlessElectronEnv(process.env),
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
