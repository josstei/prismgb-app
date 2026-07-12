import fs from 'node:fs/promises';
import path from 'node:path';
import type { MeasurementAudit } from './performance-measurement-guard.js';

export const PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION = 1;

export type PerformanceRootExitAuditFile = Readonly<{
  readonly schemaVersion: typeof PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION;
  readonly launchId: string;
  readonly controllerAudit: MeasurementAudit;
}>;

function fail(message: string): never {
  throw new Error(`Performance root-exit audit failed: ${message}`);
}

export function resolvePerformanceRootExitAuditPath(
  environment: NodeJS.ProcessEnv = process.env
): string | null {
  const configured = environment.PRISMGB_PERF_ROOT_EXIT_AUDIT_PATH;
  if (configured === undefined) return null;
  if (configured.length === 0 || !path.isAbsolute(configured)) {
    fail('output path must be a nonempty absolute path when configured');
  }
  const resolved = path.resolve(configured);
  if (resolved === path.parse(resolved).root) fail('output path must name a file');
  return resolved;
}

export async function writePerformanceRootExitAudit(
  outputPath: string,
  controllerAudit: MeasurementAudit
): Promise<PerformanceRootExitAuditFile> {
  if (typeof outputPath !== 'string' || outputPath.length === 0 || !path.isAbsolute(outputPath)) {
    fail('output path must be a nonempty absolute path');
  }
  if (controllerAudit.rootExitGate === null) {
    fail('controller audit must retain root-exit gate evidence');
  }
  const audit: PerformanceRootExitAuditFile = Object.freeze({
    schemaVersion: PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION,
    launchId: controllerAudit.launchId,
    controllerAudit
  });
  await fs.writeFile(outputPath, `${JSON.stringify(audit)}\n`, { encoding: 'utf8', flag: 'wx' });
  return audit;
}
