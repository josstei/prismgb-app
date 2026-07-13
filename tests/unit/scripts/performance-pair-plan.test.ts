import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  createPerformancePairPlan,
  resolvePerformancePairPlanLaunch,
  validatePerformancePairBinding,
  validatePerformancePairPlan
} from '../../../scripts/lib/performance-pair-plan.js';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';

const experimentId = '123e4567-e89b-42d3-a456-426614174000';
const policy = createRequire(import.meta.url)('../../../scripts/manifests/baseline-policy.json');

function createPlan() {
  let session = 0;
  return createPerformancePairPlan({
    experimentId,
    backend: 'canvas2d',
    createSessionId: () => `session-${++session}`
  });
}

function rechecksum(plan: ReturnType<typeof createPerformancePairPlan>) {
  const { checksum: _checksum, ...body } = plan;
  return canonicalSha256(body);
}

describe('performance pair plans', () => {
  it('freezes failed-open and failed-side successors outside the retry grammar', () => {
    const operation = (operationId: string) => policy.performanceOperationRegistry.operations.find((entry: { id: string }) => entry.id === operationId);
    const openShapes = operation('metric-adapter-session-open').shapes;
    const failedNoResource = openShapes.find((shape: Record<string, any>) => shape.discriminator.outcome === 'failed-no-resource');
    expect(failedNoResource.discriminator).toEqual({ outcome: 'failed-no-resource', zeroSpawned: true });
    expect(failedNoResource.successors).toEqual([]);
    const failedResourceOwned = openShapes.find((shape: Record<string, any>) => shape.discriminator.outcome === 'failed-resource-owned');
    expect(failedResourceOwned.requiredFields).toEqual(expect.arrayContaining(['abortReason', 'lastBoundary', 'resourceIdentity']));
    expect(failedResourceOwned.successors).toEqual(['metric-adapter-session-close']);

    for (const operationId of ['electron-harness-spawn', 'production-sentinel-spawn']) {
      const shapes = operation(operationId).shapes;
      const completed = shapes.find((shape: Record<string, any>) => (
        shape.discriminator.purpose === 'measurement-side' && shape.discriminator.outcome === 'completed'
      ));
      const failed = shapes.find((shape: Record<string, any>) => (
        shape.discriminator.purpose === 'measurement-side' && shape.discriminator.outcome === 'failed'
      ));
      expect([...failed.requiredFields].sort()).toEqual([...completed.requiredFields, 'abortReason', 'lastBoundary'].sort());
      expect(failed.predecessors).toEqual(['internal-reset']);
      expect(failed.successors).toEqual(['metric-adapter-session-close']);
      expect(failed.terminalField).toBe('applicationDescendantClosureEnd');
    }

    const closeShapes = operation('metric-adapter-session-close').shapes;
    expect(closeShapes.find((shape: Record<string, any>) => shape.discriminator.outcome === 'aborted').successors).toEqual([]);
    expect(closeShapes.find((shape: Record<string, any>) => shape.discriminator.outcome === 'completed').successors)
      .toEqual(['metric-adapter-session-open']);
    expect(policy.performanceFailurePolicy.metricSessionAbortTuples[0]).toEqual({
      phase: 'close', backend: 'none', reason: 'metric-adapter-close-failure'
    });
    expect(policy.performanceFailurePolicy.retryableReasons).not.toContain('metric-adapter-close-failure');
  });

  it('validates the exact balanced three-plus-six launch schedule', () => {
    const plan = createPlan();

    expect(validatePerformancePairPlan(plan)).toEqual(plan);
    expect(plan.pairs).toHaveLength(9);
    expect(plan.schemaVersion).toBe(3);
    expect(plan.pairs.map((pair) => pair.attempts[0].launches[0].buildVariant)).toEqual([
      'production', 'harness-control', 'production',
      'harness-control', 'instrumented', 'harness-control',
      'instrumented', 'harness-control', 'instrumented'
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(plan.pairs.every((pair) => pair.attempts.length === 3)).toBe(true);
    expect(plan.pairs[0].attempts.map((attempt) => attempt.launches)).toEqual([
      [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'production' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }],
      [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'production' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }],
      [{ comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'production' }, { comparisonSide: 'B', executionOrdinal: 2, buildVariant: 'harness-control' }]
    ]);
    expect(Object.isFrozen(plan.pairs[0].attempts[0].launches[0])).toBe(true);
  });

  it('rejects duplicated session tokens, plan mutations, and any reordered or retried initial pair', () => {
    expect(() => createPerformancePairPlan({
      experimentId,
      backend: 'canvas2d',
      createSessionId: () => 'duplicate'
    })).toThrow(/session IDs must be unique/);

    const plan = createPlan();
    const tampered = structuredClone(plan);
    tampered.pairs[0].attempts[0].metricSessionId = `${tampered.pairs[0].attempts[0].metricSessionId}-tampered`;
    expect(() => validatePerformancePairPlan(tampered)).toThrow(/checksum/);

    const reordered = structuredClone(plan);
    [reordered.pairs[0].attempts[0].launches[0], reordered.pairs[0].attempts[0].launches[1]] = [
      reordered.pairs[0].attempts[0].launches[1],
      reordered.pairs[0].attempts[0].launches[0]
    ];
    reordered.checksum = rechecksum(reordered);
    expect(() => validatePerformancePairPlan(reordered)).toThrow(/launch side|launch order/);

    const missingAttempt = structuredClone(plan);
    missingAttempt.pairs[0].attempts.pop();
    missingAttempt.checksum = rechecksum(missingAttempt);
    expect(() => validatePerformancePairPlan(missingAttempt)).toThrow(/preallocate exactly 3 attempts/);
  });

  it('resolves a raw capture binding only to its planned launch side', () => {
    const plan = createPlan();
    const pair = plan.pairs[1];
    const attempt = pair.attempts[1];
    const binding = {
      experimentId,
      pairPlanChecksum: plan.checksum,
      metricSessionId: attempt.metricSessionId,
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: attempt.attemptIndex,
      comparisonSide: 'A'
    } as const;

    expect(validatePerformancePairBinding(binding, { buildVariant: 'harness-control' })).toEqual(binding);
    expect(resolvePerformancePairPlanLaunch(plan, binding)).toEqual({
      pair: {
        pairPlanChecksum: plan.checksum,
        comparisonKind: 'harness-overhead',
        backend: 'canvas2d',
        pairIndex: 2,
        attemptIndex: 2,
        metricSessionId: attempt.metricSessionId
      },
      launch: { comparisonSide: 'A', executionOrdinal: 1, buildVariant: 'harness-control' }
    });
    expect(() => validatePerformancePairBinding(binding, { buildVariant: 'instrumented' })).toThrow(/does not permit build variant/);
    expect(() => resolvePerformancePairPlanLaunch(plan, { ...binding, metricSessionId: 'wrong-session' })).toThrow(/planned metric session/);
    expect(() => resolvePerformancePairPlanLaunch(plan, { ...binding, pairPlanChecksum: 'f'.repeat(64) })).toThrow(/immutable plan checksum/);
  });
});
