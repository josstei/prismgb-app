#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function runTypeScript() {
  const result = spawnSync(
    process.execPath,
    [
      './node_modules/typescript/bin/tsc',
      '-p',
      'tsconfig.app.json',
      '--noEmit',
      '--pretty',
      'false'
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function readTsStrictness(projectRoot) {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.app.json');
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const parsed = JSON.parse(raw);
  const compilerOptions = parsed.compilerOptions || {};
  return {
    strict: Boolean(compilerOptions.strict),
    noImplicitAny: Boolean(compilerOptions.noImplicitAny),
    strictNullChecks: Boolean(compilerOptions.strictNullChecks)
  };
}

function assertStrictEnabled(strictness) {
  const missing = [];
  if (!strictness.strict) {
    missing.push('strict=true');
  }
  if (!strictness.noImplicitAny) {
    missing.push('noImplicitAny=true');
  }
  if (!strictness.strictNullChecks) {
    missing.push('strictNullChecks=true');
  }

  if (missing.length > 0) {
    throw new Error(`Strict-mode gate misconfigured in tsconfig.app.json: missing ${missing.join(', ')}`);
  }
}

function main() {
  assertStrictEnabled(readTsStrictness(process.cwd()));

  const result = runTypeScript();
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  process.exit(result.status);
}

main();
