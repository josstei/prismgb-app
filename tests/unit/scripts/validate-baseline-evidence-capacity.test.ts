import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EVIDENCE_HARD_LIMITS } from '../../../scripts/lib/baseline-evidence-store.js';
import {
  CAPACITY_OUTPUT_ROOT,
  calculateQualifiedIncompleteEnvelope,
  resolveCapacityOutputRoot,
  runCapacityCli,
  runCapacityValidation,
  runCodecBoundaries,
  runHeadroomCapacity
} from '../../../scripts/validate-baseline-evidence-capacity.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('baseline evidence capacity runner', () => {
  it('keeps the compact semantic envelope separate from full-size fixtures', async () => {
    const envelope = calculateQualifiedIncompleteEnvelope({ runCount: 2 });
    expect(envelope.coverage).toHaveLength(6);
    expect(envelope.compactPerRunVectorCount).toBe(120);
    expect(envelope.compactVectorCount).toBe(14399);
    expect(Object.keys(envelope.componentMaxima)).toEqual(['rootBytes', 'maximumRecordBytes', 'expandedJsonlBytes', 'objectCount', 'recordCount']);
    const expectedMaterializedMaxima = Object.fromEntries(Object.keys(envelope.componentMaxima)
      .map((component) => [component, envelope.componentMaxima[component].value]));
    expect(envelope.materializedComponentMaxima).toEqual(expectedMaterializedMaxima);
    expect(envelope.shapes.length).toBeGreaterThanOrEqual(2);
    expect(envelope.shapes.every((shape) => shape.maximumComponents.length > 0 && shape.allocationVector.length === 2)).toBe(true);
    const result = await runHeadroomCapacity({ qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 4 });
    expect(result.scenarios).toHaveLength(9);
    expect(result.qualifiedMaximums).toEqual({ runBodies: 4, windowCallbacks: 16 });
    expect(result.compressionClaim).toBe('observed-per-scenario-not-universal');
    expect(result.scenarios.map((scenario) => scenario.name)).toEqual([
      'qualified-measured-request-proxy',
      'qualified-incomplete-request-coverage',
      'hardware-unavailable-webgpu-api',
      'hardware-unavailable-webgpu-adapter',
      'hardware-unavailable-transfer-api',
      'hardware-unavailable-transfer-method',
      'hardware-unavailable-transfer-allowlisted',
      'hardware-unavailable-worker-fallback',
      'no-host'
    ]);
    expect(result.scenarios[0]).toMatchObject({
      allocationState: 'measured-request-proxy',
      allocationEvidenceClass: 'synthetic-capacity-only',
      capacityRepresentation: 'synthetic-allocation-coverage-v1',
      callbackCohortRepresentation: 'synthetic-callback-cohort-v1',
      publicationEligible: false,
      coreCandidateChecksum: expect.any(String),
      resolvedCandidateChecksum: expect.any(String),
      acceptedRootChecksum: expect.any(String),
      evaluatorChecksum: expect.any(String),
      acceptedInstrumentedRunIds: expect.any(Array)
    });
    expect(result.scenarios[0].acceptedInstrumentedRunIds.length).toBeGreaterThan(0);
    expect(result.scenarios[0].instrumentedCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 4)).toBe(true);
    expect(result.scenarios[0].logicalCallbackCohorts).toHaveLength(4);
    expect(result.scenarios[0].logicalCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 4)).toBe(true);
    expect(result.scenarios[0].windowCallbacks).toBe(16);
    expect(result.scenarios[1]).toMatchObject({ allocationState: 'unavailable-incomplete-request-coverage', resolution: { mode: 'selected-reference' } });
    expect(result.scenarios[1]).toMatchObject({ allocationEvidenceClass: 'synthetic-capacity-only', capacityRepresentation: 'synthetic-allocation-coverage-v1', callbackCohortRepresentation: 'synthetic-callback-cohort-v1', publicationEligible: false });
    expect(result.scenarios[1].semanticEnvelopeCases).toHaveLength(envelope.shapes.length);
    expect(result.scenarios[1].semanticEnvelopeCases.flatMap((entry) => entry.maximumComponents).sort()).toEqual(Object.keys(envelope.componentMaxima).sort());
    expect(result.scenarios[1].semanticEnvelopeCases.every((entry) => entry.utilization.publicationHeadroomPassed)).toBe(true);
    expect(result.scenarios.slice(2, 8).map((scenario) => scenario.resolution.unavailabilityBranch)).toEqual([
      'webgpu-api-unavailable', 'webgpu-adapter-unavailable', 'transfer-api-unavailable',
      'transfer-method-unavailable', 'transfer-allowlisted-not-supported', 'worker-fallback-adapter'
    ]);
    expect(result.scenarios[8].resolution).toEqual({ mode: 'no-host-selected', blocker: 'phase-5-selected-reference-host' });
  }, 30000);

  it('uses contained compact workspaces and rejects output-root escape or symlink traversal', async () => {
    const limits = { ...EVIDENCE_HARD_LIMITS, maxIndexedObjects: 7, maxTotalRecords: 8 };
    expect(runCodecBoundaries({ objectCount: 7, limits })).toMatchObject({ objectCount: 7, recordCount: 8, rawOverflowRejected: true, overflowRejected: true });
    const root = path.join(CAPACITY_OUTPUT_ROOT, `unit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(root, { recursive: true });
    roots.push(root);
    const workspace = 'contained-workspace';
    const completed = await runCapacityValidation({
      mode: 'headroom',
      capacityRoot: root,
      workspaceId: workspace,
      headroomOptions: { qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 2048 }
    });
    expect(completed.headroom?.scenarios).toHaveLength(9);
    expect(completed.headroom?.scenarios.every((scenario) => scenario.archiveReplayed && scenario.rawEvidenceReplayed)).toBe(true);
    expect(completed.headroom?.scenarios.every((scenario) => scenario.logicalCallbackCohorts.every((cohort: { callbackCount: number }) => cohort.callbackCount === 2048))).toBe(true);
    expect(fs.existsSync(path.join(root, workspace))).toBe(false);
    const failedWorkspace = 'failed-workspace';
    await expect(runCapacityValidation({
      mode: 'headroom',
      capacityRoot: root,
      workspaceId: failedWorkspace,
      headroomOptions: { qualifiedRunBodies: 2, hardwareUnavailableRunBodies: 1, callbacksPerRun: 2049 }
    })).rejects.toThrow(/callback cohort is invalid/);
    expect(fs.existsSync(path.join(root, failedWorkspace))).toBe(false);
    expect(() => resolveCapacityOutputRoot(path.join(os.tmpdir(), 'outside-capacity'))).toThrow(/must stay beneath/);
    const symlink = path.join(root, 'escape-link');
    fs.symlinkSync(os.tmpdir(), symlink);
    expect(() => resolveCapacityOutputRoot(symlink)).toThrow(/symlink/);
    await expect(runCapacityCli(['--output-root', path.join(os.tmpdir(), 'outside-capacity')], { stdout: { write: () => undefined } as never })).rejects.toThrow(/unknown argument/);
  }, 30000);
});
