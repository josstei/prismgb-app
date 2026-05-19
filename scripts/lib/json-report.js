import path from 'path';
import { writeTextFile } from './files.js';

export function createReport({ name, generatedAt = new Date().toISOString(), checks = [] }) {
  return {
    name,
    generatedAt,
    checks,
    status: checks.every((check) => check.status === 'pass') ? 'pass' : 'fail'
  };
}

export function writeJsonReport(outputPath, report, cwd = process.cwd()) {
  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(cwd, outputPath);

  return writeTextFile(absolutePath, `${JSON.stringify(report, null, 2)}\n`);
}

