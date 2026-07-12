import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION,
  resolvePerformanceRootExitAuditPath,
  writePerformanceRootExitAudit
} from '@main/infrastructure/diagnostics/performance-root-exit-audit.js';
import type { MeasurementAudit } from '@main/infrastructure/diagnostics/performance-measurement-guard.js';
import { createPerformanceControllerAuditFixture } from '../../../scripts/performance-controller-audit.fixture.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-root-exit-audit-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true
  })));
});

describe('performance root-exit audit', () => {
  it('resolves only an explicit absolute fixture-owned output path', () => {
    expect(resolvePerformanceRootExitAuditPath({})).toBeNull();
    expect(resolvePerformanceRootExitAuditPath({
      PRISMGB_PERF_ROOT_EXIT_AUDIT_PATH: '/tmp/prismgb-root-exit-audit.json'
    })).toBe('/tmp/prismgb-root-exit-audit.json');
    expect(() => resolvePerformanceRootExitAuditPath({
      PRISMGB_PERF_ROOT_EXIT_AUDIT_PATH: 'root-exit-audit.json'
    })).toThrow(/absolute/);
  });

  it('writes one root-gated main-process handoff without overwrite', async () => {
    const directory = await temporaryDirectory();
    const outputPath = path.join(directory, 'root-exit-audit.json');
    const controllerAudit = createPerformanceControllerAuditFixture({
      launchId: '123e4567-e89b-42d3-a456-426614174000',
      instrumentation: true
    }) as unknown as MeasurementAudit;

    await expect(writePerformanceRootExitAudit(outputPath, controllerAudit)).resolves.toEqual({
      schemaVersion: PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION,
      launchId: controllerAudit.launchId,
      controllerAudit
    });
    await expect(fs.readFile(outputPath, 'utf8')).resolves.toBe(`${JSON.stringify({
      schemaVersion: PERFORMANCE_ROOT_EXIT_AUDIT_SCHEMA_VERSION,
      launchId: controllerAudit.launchId,
      controllerAudit
    })}\n`);
    await expect(writePerformanceRootExitAudit(outputPath, controllerAudit)).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('refuses to persist a controller audit that did not enter the root-exit gate', async () => {
    const directory = await temporaryDirectory();
    const controllerAudit = createPerformanceControllerAuditFixture({
      launchId: '123e4567-e89b-42d3-a456-426614174000',
      instrumentation: false
    }) as unknown as MeasurementAudit;

    await expect(writePerformanceRootExitAudit(path.join(directory, 'root-exit-audit.json'), {
      ...controllerAudit,
      rootExitGate: null
    })).rejects.toThrow(/root-exit gate/);
  });
});
