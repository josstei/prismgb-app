import { describe, expect, it } from 'vitest';
import {
  createPerformancePairPlan,
  resolvePerformancePairPlanLaunch,
  validatePerformancePairBinding,
  validatePerformancePairPlan
} from '../../../scripts/lib/performance-pair-plan.js';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';

const experimentId = '123e4567-e89b-42d3-a456-426614174000';

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
  it('validates the exact balanced three-plus-six launch schedule', () => {
    const plan = createPlan();

    expect(validatePerformancePairPlan(plan)).toEqual(plan);
    expect(plan.pairs).toHaveLength(9);
    expect(plan.pairs.map((pair) => pair.launches[0].buildVariant)).toEqual([
      'production', 'harness-control', 'production',
      'harness-control', 'instrumented', 'harness-control',
      'instrumented', 'harness-control', 'instrumented'
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.pairs[0].launches[0])).toBe(true);
  });

  it('rejects duplicated session tokens, plan mutations, and any reordered or retried initial pair', () => {
    expect(() => createPerformancePairPlan({
      experimentId,
      backend: 'canvas2d',
      createSessionId: () => 'duplicate'
    })).toThrow(/session IDs must be unique/);

    const plan = createPlan();
    const tampered = structuredClone(plan);
    tampered.pairs[0].metricSessionId = `${tampered.pairs[0].metricSessionId}-tampered`;
    expect(() => validatePerformancePairPlan(tampered)).toThrow(/checksum/);

    const reordered = structuredClone(plan);
    [reordered.pairs[0].launches[0], reordered.pairs[0].launches[1]] = [
      reordered.pairs[0].launches[1],
      reordered.pairs[0].launches[0]
    ];
    reordered.checksum = rechecksum(reordered);
    expect(() => validatePerformancePairPlan(reordered)).toThrow(/launch side|launch order/);

    const retried = structuredClone(plan);
    retried.pairs[0].attemptIndex = 2;
    retried.checksum = rechecksum(retried);
    expect(() => validatePerformancePairPlan(retried)).toThrow(/initial attempts/);
  });

  it('resolves a raw capture binding only to its planned launch side', () => {
    const plan = createPlan();
    const pair = plan.pairs[1];
    const binding = {
      experimentId,
      pairPlanChecksum: plan.checksum,
      metricSessionId: pair.metricSessionId,
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: pair.attemptIndex,
      comparisonSide: 'A'
    } as const;

    expect(validatePerformancePairBinding(binding, { buildVariant: 'harness-control' })).toEqual(binding);
    expect(resolvePerformancePairPlanLaunch(plan, binding)).toEqual({
      pair: {
        pairPlanChecksum: plan.checksum,
        comparisonKind: 'harness-overhead',
        backend: 'canvas2d',
        pairIndex: 2,
        attemptIndex: 1,
        metricSessionId: pair.metricSessionId
      },
      launch: { comparisonSide: 'A', buildVariant: 'harness-control' }
    });
    expect(() => validatePerformancePairBinding(binding, { buildVariant: 'instrumented' })).toThrow(/does not permit build variant/);
    expect(() => resolvePerformancePairPlanLaunch(plan, { ...binding, metricSessionId: 'wrong-session' })).toThrow(/planned metric session/);
    expect(() => resolvePerformancePairPlanLaunch(plan, { ...binding, pairPlanChecksum: 'f'.repeat(64) })).toThrow(/immutable plan checksum/);
  });
});
