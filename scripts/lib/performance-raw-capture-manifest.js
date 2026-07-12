import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalSha256, stableStringify } from './baseline-report.js';
import {
  PERFORMANCE_PAIR_CARDINALITIES,
  validatePerformancePairPlan
} from './performance-pair-plan.js';
import { readPerformanceExternalMetricCaptures } from './performance-external-metric-capture.js';
import { readPerformanceMetricSessionCaptures } from './performance-metric-session-capture.js';
import { readPerformanceSentinelCaptures } from './performance-sentinel-capture.js';
import { readPerformanceWorkloadCaptures } from './performance-workload-capture.js';

export const PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION = 1;
export const PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE = 'performance-raw-capture-manifest.json';

const EXPERIMENT_ROLES = new Set(['ci-integrity', 'reference-comparison']);
const BACKENDS = new Set(['canvas2d', 'webgpu']);
const BUILD_VARIANTS = Object.freeze({
  production: Object.freeze({ harness: false, instrumentation: false }),
  'harness-control': Object.freeze({ harness: true, instrumentation: false }),
  instrumented: Object.freeze({ harness: true, instrumentation: true })
});
const BUILD_VARIANT_IDS = Object.freeze(Object.keys(BUILD_VARIANTS));
const PAIR_COUNT = Object.values(PERFORMANCE_PAIR_CARDINALITIES)
  .reduce((total, count) => total + count, 0);
const INDEX_SPECS = Object.freeze({
  sentinel: Object.freeze({ schemaVersion: 5, captureCount: PERFORMANCE_PAIR_CARDINALITIES['harness-overhead'] * 2 }),
  externalMetric: Object.freeze({ schemaVersion: 3, captureCount: PAIR_COUNT * 2 }),
  workload: Object.freeze({ schemaVersion: 7, captureCount: PERFORMANCE_PAIR_CARDINALITIES['instrumentation-overhead'] * 2 }),
  metricSession: Object.freeze({ schemaVersion: 1, captureCount: PAIR_COUNT })
});
const RAW_CAPTURE_READERS = Object.freeze({
  sentinel: readPerformanceSentinelCaptures,
  externalMetric: readPerformanceExternalMetricCaptures,
  workload: readPerformanceWorkloadCaptures,
  metricSession: readPerformanceMetricSessionCaptures
});

function fail(message) {
  throw new TypeError(`Performance raw capture manifest failed: ${message}`);
}

function isObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys, label) {
  if (!isObject(value)) fail(`${label} must be an object`);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing ${key}`);
  }
}

function text(value, label) {
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function gitSha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{40}$/.test(value)) {
    fail(`${label} must be a lowercase Git SHA`);
  }
}

function sha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function uuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label} must be finite and >= ${minimum}`);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive safe integer`);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') fail(`${label} must be boolean`);
}

function cloneJson(value, label) {
  try {
    return JSON.parse(stableStringify(value));
  } catch (error) {
    fail(`${label} must be finite JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function freeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) freeze(nested, seen);
  return Object.freeze(value);
}

function relativePath(value, label) {
  text(value, label);
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || normalized.startsWith('/')
    || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label} must remain inside the capture output directory`);
  }
  return normalized;
}

function resolveArtifactPath(outputDirectory, value, label) {
  const root = path.resolve(outputDirectory);
  const normalized = relativePath(value, label);
  const absolutePath = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, absolutePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    fail(`${label} escapes the capture output directory`);
  }
  return absolutePath;
}

function validateBuildManifest(value, sourceSha) {
  exact(value, ['schemaVersion', 'sourceSha', 'variants'], 'build manifest');
  if (value.schemaVersion !== 1) fail('build manifest schema version is invalid');
  gitSha(value.sourceSha, 'build manifest sourceSha');
  if (value.sourceSha !== sourceSha) fail('build manifest source SHA does not match the raw capture set');
  if (!Array.isArray(value.variants) || value.variants.length !== Object.keys(BUILD_VARIANTS).length) {
    fail('build manifest must retain every registered build variant');
  }
  const seenVariants = new Set();
  for (const [index, variant] of value.variants.entries()) {
    exact(variant, ['id', 'harness', 'instrumentation', 'bundle'], `build manifest variants[${index}]`);
    text(variant.id, `build manifest variants[${index}].id`);
    boolean(variant.harness, `build manifest variants[${index}].harness`);
    boolean(variant.instrumentation, `build manifest variants[${index}].instrumentation`);
    if (!isObject(variant.bundle)) fail(`build manifest variants[${index}].bundle must be an object`);
    const expected = BUILD_VARIANTS[variant.id];
    if (!expected || expected.harness !== variant.harness || expected.instrumentation !== variant.instrumentation) {
      fail('build manifest contains an invalid build variant');
    }
    if (seenVariants.has(variant.id)) fail('build manifest contains a duplicate build variant');
    seenVariants.add(variant.id);
  }
  return cloneJson(value, 'build manifest');
}

function validateProductionBundleEvidence(value, sourceSha) {
  if (!isObject(value)) fail('production bundle evidence must be an object');
  gitSha(value.sourceSha, 'production bundle evidence sourceSha');
  if (value.sourceSha !== sourceSha) fail('production bundle evidence source SHA does not match the raw capture set');
  return cloneJson(value, 'production bundle evidence');
}

function validateBuildCommandLedger(value, sourceSha) {
  exact(value, ['schemaVersion', 'sourceSha', 'entries'], 'build command ledger');
  if (value.schemaVersion !== 1) fail('build command ledger schema version is invalid');
  gitSha(value.sourceSha, 'build command ledger sourceSha');
  if (value.sourceSha !== sourceSha) fail('build command ledger source SHA does not match the raw capture set');
  if (!Array.isArray(value.entries) || value.entries.length !== BUILD_VARIANT_IDS.length) {
    fail('build command ledger must retain every build variant exactly once');
  }
  for (const [index, entry] of value.entries.entries()) {
    exact(entry, ['sequence', 'operationId', 'start', 'end', 'buildId', 'closure'], `build command ledger entries[${index}]`);
    if (entry.sequence !== index + 1 || entry.operationId !== 'build-spawn' || entry.buildId !== BUILD_VARIANT_IDS[index]) {
      fail('build command ledger entry does not match the required build sequence');
    }
    finite(entry.start, `build command ledger entries[${index}].start`);
    finite(entry.end, `build command ledger entries[${index}].end`, entry.start);
    exact(entry.closure, ['closed', 'stdoutDrained', 'stderrDrained', 'inputClosed', 'exit', 'zeroSurvivors'], `build command ledger entries[${index}].closure`);
    for (const key of ['closed', 'stdoutDrained', 'stderrDrained', 'inputClosed', 'zeroSurvivors']) {
      if (entry.closure[key] !== true) fail('build command ledger entry must retain successful process closure evidence');
    }
    exact(entry.closure.exit, ['code', 'durationMs'], `build command ledger entries[${index}].closure.exit`);
    if (entry.closure.exit.code !== 0) fail('build command ledger entry must retain a successful process exit');
    finite(entry.closure.exit.durationMs, `build command ledger entries[${index}].closure.exit.durationMs`);
  }
  return cloneJson(value, 'build command ledger');
}

function validateCaptureIndex(value, spec, sourceSha, label) {
  exact(value, ['schemaVersion', 'sourceSha', 'captures', 'checksum'], label);
  if (value.schemaVersion !== spec.schemaVersion) fail(`${label} schema version is invalid`);
  gitSha(value.sourceSha, `${label} sourceSha`);
  if (value.sourceSha !== sourceSha) fail(`${label} source SHA does not match the raw capture set`);
  if (!Array.isArray(value.captures) || value.captures.length !== spec.captureCount) {
    fail(`${label} does not retain the exact planned capture count`);
  }
  sha(value.checksum, `${label} checksum`);
  const captures = cloneJson(value.captures, `${label} captures`);
  const captureChecksums = new Set();
  const capturePaths = new Set();
  for (const [index, capture] of captures.entries()) {
    if (!isObject(capture)) fail(`${label} captures[${index}] must be an object`);
    const captureRelativePath = relativePath(capture.relativePath, `${label} captures[${index}].relativePath`);
    sha(capture.checksum, `${label} captures[${index}].checksum`);
    if (captureChecksums.has(capture.checksum)) fail(`${label} contains a duplicate capture checksum`);
    if (capturePaths.has(captureRelativePath)) fail(`${label} contains a duplicate capture path`);
    captureChecksums.add(capture.checksum);
    capturePaths.add(captureRelativePath);
  }
  const body = { schemaVersion: value.schemaVersion, sourceSha: value.sourceSha, captures };
  if (canonicalSha256(body) !== value.checksum) fail(`${label} checksum does not match its body`);
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    captureCount: captures.length,
    checksum: value.checksum
  });
}

function createIndexReference(value, spec, sourceSha, label) {
  exact(value, ['relativePath', 'index'], label);
  return Object.freeze({
    relativePath: relativePath(value.relativePath, `${label}.relativePath`),
    ...validateCaptureIndex(value.index, spec, sourceSha, `${label}.index`)
  });
}

function validateIndexReference(value, spec, label) {
  exact(value, ['relativePath', 'schemaVersion', 'captureCount', 'checksum'], label);
  const normalized = {
    relativePath: relativePath(value.relativePath, `${label}.relativePath`),
    schemaVersion: value.schemaVersion,
    captureCount: value.captureCount,
    checksum: value.checksum
  };
  if (normalized.schemaVersion !== spec.schemaVersion || normalized.captureCount !== spec.captureCount) {
    fail(`${label} does not match the exact planned capture index shape`);
  }
  sha(normalized.checksum, `${label}.checksum`);
  return normalized;
}

function validateArtifactReference(value, label) {
  exact(value, ['relativePath', 'checksum'], label);
  return {
    relativePath: relativePath(value.relativePath, `${label}.relativePath`),
    checksum: (() => {
      sha(value.checksum, `${label}.checksum`);
      return value.checksum;
    })()
  };
}

function validateUniqueArtifactPaths(manifest) {
  const paths = [
    manifest.pairPlan.relativePath,
    manifest.build.manifest.relativePath,
    manifest.build.productionBundleEvidence.relativePath,
    manifest.build.commandLedger.relativePath,
    ...Object.values(manifest.indexes).map((reference) => reference.relativePath)
  ];
  if (new Set(paths).size !== paths.length) fail('raw capture manifest references one artifact path more than once');
  if (paths.includes(PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE)) {
    fail('raw capture manifest cannot bind itself as an input artifact');
  }
}

function manifestBody(value) {
  exact(value, ['schemaVersion', 'sourceSha', 'role', 'selectedHost', 'experiment', 'pairPlan', 'build', 'indexes'], 'raw capture manifest');
  if (value.schemaVersion !== PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION) {
    fail('raw capture manifest schema version is invalid');
  }
  gitSha(value.sourceSha, 'raw capture manifest sourceSha');
  text(value.role, 'raw capture manifest role');
  if (!EXPERIMENT_ROLES.has(value.role)) fail('raw capture manifest role is invalid');
  boolean(value.selectedHost, 'raw capture manifest selectedHost');
  if ((value.role === 'ci-integrity' && value.selectedHost) || (value.role === 'reference-comparison' && !value.selectedHost)) {
    fail('raw capture manifest role and selected-host state are incompatible');
  }
  exact(value.experiment, ['id', 'deadlineSeconds', 'elapsedSeconds', 'backend'], 'raw capture manifest experiment');
  uuid(value.experiment.id, 'raw capture manifest experiment.id');
  positiveInteger(value.experiment.deadlineSeconds, 'raw capture manifest experiment.deadlineSeconds');
  finite(value.experiment.elapsedSeconds, 'raw capture manifest experiment.elapsedSeconds');
  if (value.experiment.elapsedSeconds > value.experiment.deadlineSeconds) {
    fail('raw capture manifest experiment elapsed time exceeds its deadline');
  }
  text(value.experiment.backend, 'raw capture manifest experiment.backend');
  if (!BACKENDS.has(value.experiment.backend)) fail('raw capture manifest experiment backend is invalid');
  exact(value.pairPlan, ['relativePath', 'checksum'], 'raw capture manifest pairPlan');
  const pairPlan = validateArtifactReference(value.pairPlan, 'raw capture manifest pairPlan');
  exact(value.build, ['manifest', 'productionBundleEvidence', 'commandLedger'], 'raw capture manifest build');
  const build = {
    manifest: validateArtifactReference(value.build.manifest, 'raw capture manifest build.manifest'),
    productionBundleEvidence: validateArtifactReference(
      value.build.productionBundleEvidence,
      'raw capture manifest build.productionBundleEvidence'
    ),
    commandLedger: validateArtifactReference(value.build.commandLedger, 'raw capture manifest build.commandLedger')
  };
  exact(value.indexes, Object.keys(INDEX_SPECS), 'raw capture manifest indexes');
  const indexes = Object.fromEntries(Object.entries(INDEX_SPECS).map(([key, spec]) => [
    key,
    validateIndexReference(value.indexes[key], spec, `raw capture manifest indexes.${key}`)
  ]));
  const manifest = {
    schemaVersion: value.schemaVersion,
    sourceSha: value.sourceSha,
    role: value.role,
    selectedHost: value.selectedHost,
    experiment: {
      id: value.experiment.id,
      deadlineSeconds: value.experiment.deadlineSeconds,
      elapsedSeconds: value.experiment.elapsedSeconds,
      backend: value.experiment.backend
    },
    pairPlan,
    build,
    indexes
  };
  validateUniqueArtifactPaths(manifest);
  return manifest;
}

/**
 * Seals the completed raw-capture inputs for a later evaluator handoff. It is
 * intentionally not an experiment parent, verdict, or publication artifact.
 * Its build command ledger proves only the pre-loop build sequence.
 */
export function createPerformanceRawCaptureManifest(input) {
  exact(input, [
    'sourceSha', 'role', 'selectedHost', 'experimentId', 'experimentDeadlineSeconds',
    'experimentElapsedSeconds', 'pairPlan', 'pairPlanRelativePath', 'buildManifest',
    'buildManifestRelativePath', 'productionBundleEvidence',
    'productionBundleEvidenceRelativePath', 'commandLedger', 'commandLedgerRelativePath', 'indexes'
  ], 'raw capture manifest input');
  gitSha(input.sourceSha, 'raw capture manifest input sourceSha');
  uuid(input.experimentId, 'raw capture manifest input experimentId');
  positiveInteger(input.experimentDeadlineSeconds, 'raw capture manifest input experimentDeadlineSeconds');
  finite(input.experimentElapsedSeconds, 'raw capture manifest input experimentElapsedSeconds');
  const pairPlan = validatePerformancePairPlan(input.pairPlan);
  if (pairPlan.experimentId !== input.experimentId) fail('raw capture manifest pair plan does not bind the experiment ID');
  const buildManifest = validateBuildManifest(input.buildManifest, input.sourceSha);
  const productionBundleEvidence = validateProductionBundleEvidence(input.productionBundleEvidence, input.sourceSha);
  const commandLedger = validateBuildCommandLedger(input.commandLedger, input.sourceSha);
  exact(input.indexes, Object.keys(INDEX_SPECS), 'raw capture manifest input indexes');
  const indexes = Object.fromEntries(Object.entries(INDEX_SPECS).map(([key, spec]) => [
    key,
    createIndexReference(input.indexes[key], spec, input.sourceSha, `raw capture manifest input indexes.${key}`)
  ]));
  const body = manifestBody({
    schemaVersion: PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION,
    sourceSha: input.sourceSha,
    role: input.role,
    selectedHost: input.selectedHost,
    experiment: {
      id: input.experimentId,
      deadlineSeconds: input.experimentDeadlineSeconds,
      elapsedSeconds: input.experimentElapsedSeconds,
      backend: pairPlan.backend
    },
    pairPlan: {
      relativePath: relativePath(input.pairPlanRelativePath, 'raw capture manifest input pairPlanRelativePath'),
      checksum: pairPlan.checksum
    },
    build: {
      manifest: {
        relativePath: relativePath(input.buildManifestRelativePath, 'raw capture manifest input buildManifestRelativePath'),
        checksum: canonicalSha256(buildManifest)
      },
      productionBundleEvidence: {
        relativePath: relativePath(
          input.productionBundleEvidenceRelativePath,
          'raw capture manifest input productionBundleEvidenceRelativePath'
        ),
        checksum: canonicalSha256(productionBundleEvidence)
      },
      commandLedger: {
        relativePath: relativePath(input.commandLedgerRelativePath, 'raw capture manifest input commandLedgerRelativePath'),
        checksum: canonicalSha256(commandLedger)
      }
    },
    indexes
  });
  return freeze({ ...body, checksum: canonicalSha256(body) });
}

export function validatePerformanceRawCaptureManifest(value) {
  exact(value, [
    'schemaVersion', 'sourceSha', 'role', 'selectedHost', 'experiment', 'pairPlan',
    'build', 'indexes', 'checksum'
  ], 'raw capture manifest');
  sha(value.checksum, 'raw capture manifest checksum');
  const body = manifestBody({
    schemaVersion: value.schemaVersion,
    sourceSha: value.sourceSha,
    role: value.role,
    selectedHost: value.selectedHost,
    experiment: value.experiment,
    pairPlan: value.pairPlan,
    build: value.build,
    indexes: value.indexes
  });
  if (canonicalSha256(body) !== value.checksum) fail('raw capture manifest checksum does not match its body');
  return freeze({ ...body, checksum: value.checksum });
}

export async function writePerformanceRawCaptureManifest({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'raw capture manifest outputDirectory');
  const manifest = createPerformanceRawCaptureManifest(input);
  const root = path.resolve(outputDirectory);
  const absolutePath = path.resolve(root, PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE);
  if (path.relative(root, absolutePath).startsWith('..')) fail('raw capture manifest output path escapes its output directory');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(absolutePath, `${stableStringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx' });
  return Object.freeze({ manifest, absolutePath, relativePath: PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE });
}

async function readJsonArtifact(outputDirectory, reference, label) {
  const absolutePath = resolveArtifactPath(outputDirectory, reference.relativePath, label);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  } catch (error) {
    fail(`${label} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parsed;
}

async function replayRawCaptureIndex(outputDirectory, key, index) {
  const reader = RAW_CAPTURE_READERS[key];
  if (typeof reader !== 'function') fail(`raw capture manifest does not have a reader for ${key}`);
  const expectedByPath = new Map(index.captures.map((capture) => [
    relativePath(capture.relativePath, `raw capture manifest ${key} capture path`),
    capture.checksum
  ]));
  const captures = await reader({ outputDirectory });
  if (captures.length !== expectedByPath.size) {
    fail(`raw capture manifest ${key} raw captures do not match the sealed index`);
  }
  for (const entry of captures) {
    const expectedChecksum = expectedByPath.get(entry.relativePath);
    if (expectedChecksum !== entry.capture.checksum) {
      fail(`raw capture manifest ${key} raw captures do not match the sealed index`);
    }
  }
}

export async function readPerformanceRawCaptureManifest({ outputDirectory } = {}) {
  text(outputDirectory, 'raw capture manifest outputDirectory');
  const root = path.resolve(outputDirectory);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(path.join(root, PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE), 'utf8'));
  } catch (error) {
    fail(`raw capture manifest is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = validatePerformanceRawCaptureManifest(parsed);
  const pairPlan = validatePerformancePairPlan(await readJsonArtifact(root, manifest.pairPlan, 'raw capture manifest pair plan'));
  if (pairPlan.experimentId !== manifest.experiment.id || pairPlan.backend !== manifest.experiment.backend
    || pairPlan.checksum !== manifest.pairPlan.checksum) {
    fail('raw capture manifest pair plan does not match its sealed reference');
  }
  const buildManifest = validateBuildManifest(
    await readJsonArtifact(root, manifest.build.manifest, 'raw capture manifest build manifest'),
    manifest.sourceSha
  );
  if (canonicalSha256(buildManifest) !== manifest.build.manifest.checksum) {
    fail('raw capture manifest build manifest does not match its sealed reference');
  }
  const productionBundleEvidence = validateProductionBundleEvidence(
    await readJsonArtifact(root, manifest.build.productionBundleEvidence, 'raw capture manifest production bundle evidence'),
    manifest.sourceSha
  );
  if (canonicalSha256(productionBundleEvidence) !== manifest.build.productionBundleEvidence.checksum) {
    fail('raw capture manifest production bundle evidence does not match its sealed reference');
  }
  const commandLedger = validateBuildCommandLedger(
    await readJsonArtifact(root, manifest.build.commandLedger, 'raw capture manifest build command ledger'),
    manifest.sourceSha
  );
  if (canonicalSha256(commandLedger) !== manifest.build.commandLedger.checksum) {
    fail('raw capture manifest build command ledger does not match its sealed reference');
  }
  const indexes = {};
  for (const [key, spec] of Object.entries(INDEX_SPECS)) {
    const reference = manifest.indexes[key];
    const index = await readJsonArtifact(root, reference, `raw capture manifest ${key} index`);
    const normalized = validateCaptureIndex(index, spec, manifest.sourceSha, `raw capture manifest ${key} index`);
    if (normalized.schemaVersion !== reference.schemaVersion
      || normalized.captureCount !== reference.captureCount
      || normalized.checksum !== reference.checksum) {
      fail(`raw capture manifest ${key} index does not match its sealed reference`);
    }
    indexes[key] = cloneJson(index, `raw capture manifest ${key} index`);
  }
  for (const [key, index] of Object.entries(indexes)) {
    await replayRawCaptureIndex(root, key, index);
  }
  return freeze({ manifest, pairPlan, buildManifest, productionBundleEvidence, commandLedger, indexes });
}
