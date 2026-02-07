#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

function parseArgs(argv) {
  const options = {
    output: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') {
      options.output = argv[index + 1] || null;
      index += 1;
    }
  }

  return options;
}

function runStrictProbe() {
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

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function collectDiagnostics(stdoutText) {
  const lines = stdoutText.split(/\r?\n/).filter(Boolean);
  const fileTotals = new Map();
  const codeTotals = new Map();

  const linePattern = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, filePath, lineNumber, columnNumber, code, message] = match;
    const normalizedFile = normalizeRelativePath(path.relative(process.cwd(), filePath));

    fileTotals.set(normalizedFile, (fileTotals.get(normalizedFile) || 0) + 1);
    codeTotals.set(code, (codeTotals.get(code) || 0) + 1);
  }

  const files = [...fileTotals.entries()]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  const codes = [...codeTotals.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    totalDiagnostics: files.reduce((total, entry) => total + entry.count, 0),
    files,
    codes
  };
}

function writeOutput(outputPath, report) {
  const absolute = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  return absolute;
}

function printSummary(report, status) {
  console.log('Type Debt Report');
  console.log(`- probe exit code: ${status}`);
  console.log(`- total diagnostics: ${report.totalDiagnostics}`);
  console.log('- top files:');
  for (const entry of report.files.slice(0, 10)) {
    console.log(`  - ${entry.file}: ${entry.count}`);
  }
  console.log('- top diagnostic codes:');
  for (const entry of report.codes.slice(0, 10)) {
    console.log(`  - TS${entry.code}: ${entry.count}`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const probeResult = runStrictProbe();
  const report = collectDiagnostics(probeResult.stdout);

  printSummary(report, probeResult.status);

  if (options.output) {
    const outputPath = writeOutput(options.output, report);
    console.log(`- wrote report json: ${outputPath}`);
  }

  process.exit(0);
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}

export {
  collectDiagnostics,
  runStrictProbe,
  writeOutput
};
