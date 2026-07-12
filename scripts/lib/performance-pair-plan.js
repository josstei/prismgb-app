import crypto from 'node:crypto';

export const PERFORMANCE_PAIR_CARDINALITIES = Object.freeze({
  'harness-overhead': 3,
  'instrumentation-overhead': 6
});

export const PERFORMANCE_PAIR_BUILD_VARIANTS = Object.freeze({
  'harness-overhead': Object.freeze(['production', 'harness-control']),
  'instrumentation-overhead': Object.freeze(['harness-control', 'instrumented'])
});

const BACKENDS = new Set(['canvas2d', 'webgpu']);
const COMPARISON_SIDES = new Set(['A', 'B']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(message) {
  throw new TypeError(`Performance pair plan failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertExactKeys(value, keys, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function assertUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function assertNonemptyString(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a nonempty string`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    fail(`${label} must be a positive safe integer`);
  }
}

function expectedLaunchVariants(comparisonKind, pairIndex) {
  const canonicalVariants = PERFORMANCE_PAIR_BUILD_VARIANTS[comparisonKind];
  if (!canonicalVariants) fail(`pair comparison kind ${comparisonKind} is invalid`);
  return pairIndex % 2 === 1 ? canonicalVariants : [...canonicalVariants].reverse();
}

function freezePairPlan(value) {
  return Object.freeze({
    ...value,
    pairs: Object.freeze(value.pairs.map((pair) => Object.freeze({
      ...pair,
      launches: Object.freeze(pair.launches.map((launch) => Object.freeze({ ...launch })))
    })))
  });
}

/**
 * Creates the closed, balanced launch order for one backend family. The
 * immutable plan separates order from pair identity: every side remains
 * ledger-addressable even when the cold-launch order alternates.
 *
 * @param {{
 *   experimentId: string,
 *   backend: 'canvas2d' | 'webgpu',
 *   createSessionId?: () => string
 * }} options
 */
export function createPerformancePairPlan({
  experimentId,
  backend,
  createSessionId = () => crypto.randomUUID()
} = {}) {
  assertUuid(experimentId, 'performance pair plan experimentId');
  if (!BACKENDS.has(backend)) fail('performance pair plan backend is invalid');
  if (typeof createSessionId !== 'function') {
    fail('performance pair plan session ID factory must be a function');
  }

  const sessionTokens = new Set();
  const pairs = [];
  for (const comparisonKind of Object.keys(PERFORMANCE_PAIR_CARDINALITIES)) {
    const pairCount = PERFORMANCE_PAIR_CARDINALITIES[comparisonKind];
    for (let pairIndex = 1; pairIndex <= pairCount; pairIndex += 1) {
      const sessionToken = createSessionId();
      assertNonemptyString(sessionToken, 'performance pair plan metric session ID');
      if (sessionTokens.has(sessionToken)) {
        fail('performance pair plan session IDs must be unique');
      }
      sessionTokens.add(sessionToken);
      const launches = expectedLaunchVariants(comparisonKind, pairIndex).map((buildVariant, index) => ({
        comparisonSide: index === 0 ? 'A' : 'B',
        buildVariant
      }));
      pairs.push({
        comparisonKind,
        backend,
        pairIndex,
        attemptIndex: 1,
        metricSessionId: `${experimentId}:${comparisonKind}:${backend}:pair-${pairIndex}:attempt-1:${sessionToken}`,
        launches
      });
    }
  }
  return freezePairPlan({
    schemaVersion: 1,
    experimentId,
    backend,
    pairs
  });
}

/**
 * Validates the runner-authored initial pair schedule before an E2E executor
 * uses it. Retry attempts are intentionally not present in this closed plan;
 * they are added only by the evidence owner after a terminal abort.
 */
export function validatePerformancePairPlan(value) {
  assertExactKeys(value, ['schemaVersion', 'experimentId', 'backend', 'pairs'], 'performance pair plan');
  if (value.schemaVersion !== 1) fail('performance pair plan schema version is invalid');
  assertUuid(value.experimentId, 'performance pair plan experimentId');
  if (!BACKENDS.has(value.backend)) fail('performance pair plan backend is invalid');
  if (!Array.isArray(value.pairs)) fail('performance pair plan pairs must be an array');

  const expectedPairCount = Object.values(PERFORMANCE_PAIR_CARDINALITIES).reduce((total, count) => total + count, 0);
  if (value.pairs.length !== expectedPairCount) {
    fail(`performance pair plan requires exactly ${expectedPairCount} pairs`);
  }
  const metricSessionIds = new Set();
  const pairs = [];
  let offset = 0;
  for (const comparisonKind of Object.keys(PERFORMANCE_PAIR_CARDINALITIES)) {
    for (let pairIndex = 1; pairIndex <= PERFORMANCE_PAIR_CARDINALITIES[comparisonKind]; pairIndex += 1) {
      const pair = value.pairs[offset++];
      assertExactKeys(pair, [
        'comparisonKind', 'backend', 'pairIndex', 'attemptIndex', 'metricSessionId', 'launches'
      ], `performance pair plan pair ${offset}`);
      if (pair.comparisonKind !== comparisonKind) {
        fail('performance pair plan comparison kinds must remain grouped and ordered');
      }
      if (pair.backend !== value.backend) fail('performance pair plan pair backend does not match the plan');
      if (pair.pairIndex !== pairIndex) fail('performance pair plan pair indices must be contiguous from one');
      if (pair.attemptIndex !== 1) fail('performance pair plan initial attempts must be one');
      assertNonemptyString(pair.metricSessionId, 'performance pair plan metric session ID');
      if (metricSessionIds.has(pair.metricSessionId)) fail('performance pair plan metric session IDs must be unique');
      metricSessionIds.add(pair.metricSessionId);
      if (!Array.isArray(pair.launches) || pair.launches.length !== 2) {
        fail('performance pair plan pair must contain exactly two launches');
      }
      const expectedVariants = expectedLaunchVariants(comparisonKind, pairIndex);
      const launches = pair.launches.map((launch, launchIndex) => {
        assertExactKeys(launch, ['comparisonSide', 'buildVariant'], `performance pair plan pair ${offset} launch ${launchIndex + 1}`);
        const comparisonSide = launchIndex === 0 ? 'A' : 'B';
        if (launch.comparisonSide !== comparisonSide || !COMPARISON_SIDES.has(launch.comparisonSide)) {
          fail('performance pair plan launch side is invalid');
        }
        if (launch.buildVariant !== expectedVariants[launchIndex]) {
          fail('performance pair plan launch order is not balanced');
        }
        return { comparisonSide: launch.comparisonSide, buildVariant: launch.buildVariant };
      });
      pairs.push({
        comparisonKind,
        backend: pair.backend,
        pairIndex,
        attemptIndex: 1,
        metricSessionId: pair.metricSessionId,
        launches
      });
    }
  }
  return freezePairPlan({
    schemaVersion: 1,
    experimentId: value.experimentId,
    backend: value.backend,
    pairs
  });
}

/**
 * Validates pair metadata retained by a launch-owned raw capture. The exact
 * planned side remains checked by the runner when it joins this binding back
 * to the immutable pair plan.
 */
export function validatePerformancePairBinding(value, {
  label = 'performance pair binding',
  buildVariant = null
} = {}) {
  assertExactKeys(value, [
    'experimentId', 'metricSessionId', 'comparisonKind', 'backend',
    'pairIndex', 'attemptIndex', 'comparisonSide'
  ], label);
  assertUuid(value.experimentId, `${label}.experimentId`);
  assertNonemptyString(value.metricSessionId, `${label}.metricSessionId`);
  if (!Object.hasOwn(PERFORMANCE_PAIR_CARDINALITIES, value.comparisonKind)) {
    fail(`${label}.comparisonKind is invalid`);
  }
  if (!BACKENDS.has(value.backend)) fail(`${label}.backend is invalid`);
  assertPositiveInteger(value.pairIndex, `${label}.pairIndex`);
  assertPositiveInteger(value.attemptIndex, `${label}.attemptIndex`);
  if (!COMPARISON_SIDES.has(value.comparisonSide)) fail(`${label}.comparisonSide is invalid`);
  if (buildVariant !== null && !PERFORMANCE_PAIR_BUILD_VARIANTS[value.comparisonKind].includes(buildVariant)) {
    fail(`${label} does not permit build variant ${buildVariant}`);
  }
  return Object.freeze({
    experimentId: value.experimentId,
    metricSessionId: value.metricSessionId,
    comparisonKind: value.comparisonKind,
    backend: value.backend,
    pairIndex: value.pairIndex,
    attemptIndex: value.attemptIndex,
    comparisonSide: value.comparisonSide
  });
}

export function resolvePerformancePairPlanLaunch(planInput, bindingInput) {
  const plan = validatePerformancePairPlan(planInput);
  const binding = validatePerformancePairBinding(bindingInput);
  if (binding.experimentId !== plan.experimentId || binding.backend !== plan.backend) {
    fail('performance pair binding does not match the plan experiment or backend');
  }
  const pair = plan.pairs.find((candidate) => (
    candidate.comparisonKind === binding.comparisonKind
    && candidate.pairIndex === binding.pairIndex
    && candidate.attemptIndex === binding.attemptIndex
  ));
  if (!pair || pair.metricSessionId !== binding.metricSessionId) {
    fail('performance pair binding does not match one planned metric session');
  }
  const launch = pair.launches.find((candidate) => candidate.comparisonSide === binding.comparisonSide);
  if (!launch) fail('performance pair binding does not match one planned launch side');
  return Object.freeze({
    pair: Object.freeze({
      comparisonKind: pair.comparisonKind,
      backend: pair.backend,
      pairIndex: pair.pairIndex,
      attemptIndex: pair.attemptIndex,
      metricSessionId: pair.metricSessionId
    }),
    launch: Object.freeze({ ...launch })
  });
}
