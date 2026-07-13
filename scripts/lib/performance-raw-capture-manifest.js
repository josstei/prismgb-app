import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  canonicalSha256,
  stableStringify,
  validateCaptureProvenance
} from './baseline-report.js';
import {
  PERFORMANCE_RAW_KIND_ORDER,
  performanceRawKindsForCapture,
  validatePerformanceCaptureRawGrammar,
  validatePerformancePairPlan,
  validatePerformanceScopedRawRow
} from './performance-pair-plan.js';
import { validatePerformanceLedger } from './performance-evidence.js';
import { validatePerformanceExternalMetricCapture } from './performance-external-metric-capture.js';
import { validatePerformanceMetricSessionCapture } from './performance-metric-session-capture.js';
import { validatePerformanceSentinelCapture } from './performance-sentinel-capture.js';
import { validatePerformanceWorkloadCapture } from './performance-workload-capture.js';

const BASELINE_POLICY = createRequire(import.meta.url)('../manifests/baseline-policy.json');

export const PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION = 2;
export const PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE = 'performance-raw-capture-manifest.json';

export const PERFORMANCE_CAPTURE_KIND_REGISTRY = Object.freeze({
  'experiment-environment': Object.freeze({ captureVersion: 1, indexVersion: 1, indexKey: 'environment' }),
  transport: Object.freeze({ captureVersion: 1, indexVersion: 1, indexKey: 'transport' }),
  qualification: Object.freeze({ captureVersion: 1, indexVersion: 1, indexKey: 'qualification' }),
  sentinel: Object.freeze({ captureVersion: 8, indexVersion: 7, indexKey: 'sentinel' }),
  'external-metric': Object.freeze({ captureVersion: 4, indexVersion: 4, indexKey: 'externalMetric' }),
  workload: Object.freeze({ captureVersion: 9, indexVersion: 9, indexKey: 'workload' }),
  'metric-session': Object.freeze({ captureVersion: 2, indexVersion: 2, indexKey: 'metricSession' })
});

const BACKEND_ORDER = Object.freeze(['canvas2d', 'webgpu']);
const BACKEND_INDEX_KEYS = Object.freeze(['sentinel', 'externalMetric', 'workload', 'metricSession']);
const EXPERIMENT_ROLES = new Set(['ci-integrity', 'reference-comparison']);
const MODES = new Set(['ci-core', 'selected-reference']);
const PURPOSES = new Set(['publication', 'capacity-fixture']);
const BUILD_VARIANTS = Object.freeze([
  Object.freeze({ id: 'production', harness: false, instrumentation: false }),
  Object.freeze({ id: 'harness-control', harness: true, instrumentation: false }),
  Object.freeze({ id: 'instrumented', harness: true, instrumentation: true })
]);

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
  for (const key of Object.keys(value)) if (!expected.has(key)) fail(`${label} has an unknown field ${key}`);
  for (const key of keys) if (!(key in value)) fail(`${label} is missing ${key}`);
}

function text(value, label, maximumBytes = 4096) {
  if (typeof value !== 'string' || value.length === 0 || Buffer.byteLength(value, 'utf8') > maximumBytes) {
    fail(`${label} must be a bounded nonempty string`);
  }
}

function sha(value, label, length = 64) {
  if (typeof value !== 'string' || !new RegExp(`^[a-f0-9]{${length}}$`).test(value)) fail(`${label} is invalid`);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function uuid(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    fail(`${label} must be a UUID`);
  }
}

function clone(value, label) {
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireContiguous(rows, field, label, start = 1) {
  const ordered = [...rows].sort((left, right) => left[field] - right[field]);
  ordered.forEach((row, index) => {
    if (row[field] !== start + index) fail(`${label}.${field} must be contiguous from ${start}`);
  });
}

function relativePath(value, label) {
  text(value, label);
  if (value !== value.normalize('NFC') || value.includes('\\')) fail(`${label} must use canonical slash-separated syntax`);
  const segments = value.split('/');
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    fail(`${label} must remain beneath the capture output directory`);
  }
  return value;
}

function leaf(value, label) {
  exact(value, ['relativePath', 'checksum'], label);
  const normalized = relativePath(value.relativePath, `${label}.relativePath`);
  sha(value.checksum, `${label}.checksum`);
  return { relativePath: normalized, checksum: value.checksum };
}

function validateEvaluationContext(value) {
  exact(value, ['experimentId', 'experimentRole', 'sourceSha', 'policyHash'], 'evaluationContext');
  uuid(value.experimentId, 'evaluationContext.experimentId');
  if (!EXPERIMENT_ROLES.has(value.experimentRole)) fail('evaluationContext.experimentRole is invalid');
  sha(value.sourceSha, 'evaluationContext.sourceSha', 40);
  sha(value.policyHash, 'evaluationContext.policyHash');
  return { ...value };
}

function validateSemanticAuthority(value) {
  exact(value, ['generatedAt', 'repository', 'environment', 'inputs', 'reset', 'seed'], 'semanticAuthority');
  text(value.generatedAt, 'semanticAuthority.generatedAt');
  for (const key of ['repository', 'environment', 'inputs', 'reset', 'seed']) {
    if (!isObject(value[key])) fail(`semanticAuthority.${key} must be an object`);
  }
  return clone(value, 'semanticAuthority');
}

function validateEvidenceProvenance(value, purpose) {
  if (purpose === 'publication') {
    exact(value, ['kind', 'captureProvenance'], 'evidenceProvenance');
    if (value.kind !== 'runtime-capture') fail('publication evidence provenance must be runtime-capture');
    return { kind: value.kind, captureProvenance: validateCaptureProvenance(value.captureProvenance) };
  }
  exact(value, ['kind', 'fixtureId', 'scenarioId', 'seedHash', 'runtimeProjection'], 'evidenceProvenance');
  if (value.kind !== 'capacity-fixture') fail('capacity evidence provenance must be capacity-fixture');
  text(value.fixtureId, 'evidenceProvenance.fixtureId', 1024);
  text(value.scenarioId, 'evidenceProvenance.scenarioId', 1024);
  sha(value.seedHash, 'evidenceProvenance.seedHash');
  return {
    kind: value.kind,
    fixtureId: value.fixtureId,
    scenarioId: value.scenarioId,
    seedHash: value.seedHash,
    runtimeProjection: validateCaptureProvenance(value.runtimeProjection)
  };
}

function validateMemberReferences(value, backendFamilies, mode) {
  exact(value, [
    'buildManifest', 'productionBundleEvidence', 'buildCommandLedger', 'performanceLedger',
    'qualificationEvidence', 'experimentEvidence', 'backendFamilies'
  ], 'memberReferences');
  const direct = {
    buildManifest: leaf(value.buildManifest, 'memberReferences.buildManifest'),
    productionBundleEvidence: leaf(value.productionBundleEvidence, 'memberReferences.productionBundleEvidence'),
    buildCommandLedger: leaf(value.buildCommandLedger, 'memberReferences.buildCommandLedger'),
    performanceLedger: leaf(value.performanceLedger, 'memberReferences.performanceLedger')
  };
  let qualificationEvidence = null;
  if (value.qualificationEvidence !== null) {
    exact(value.qualificationEvidence, ['index'], 'memberReferences.qualificationEvidence');
    qualificationEvidence = { index: leaf(value.qualificationEvidence.index, 'memberReferences.qualificationEvidence.index') };
  }
  if ((mode === 'ci-core') !== (qualificationEvidence === null)) fail('qualification evidence presence does not match manifest mode');
  exact(value.experimentEvidence, ['indexes'], 'memberReferences.experimentEvidence');
  exact(value.experimentEvidence.indexes, ['environment', 'transport'], 'memberReferences.experimentEvidence.indexes');
  const experimentEvidence = { indexes: {
    environment: leaf(value.experimentEvidence.indexes.environment, 'memberReferences.experimentEvidence.indexes.environment'),
    transport: leaf(value.experimentEvidence.indexes.transport, 'memberReferences.experimentEvidence.indexes.transport')
  } };
  if (!Array.isArray(value.backendFamilies) || value.backendFamilies.length !== backendFamilies.length) {
    fail('memberReferences.backendFamilies does not match backendFamilies');
  }
  const backendMembers = value.backendFamilies.map((family, index) => {
    exact(family, ['backend', 'pairPlan', 'indexes'], `memberReferences.backendFamilies[${index}]`);
    if (family.backend !== backendFamilies[index]) fail('member backend order does not match backendFamilies');
    exact(family.indexes, BACKEND_INDEX_KEYS, `memberReferences.backendFamilies[${index}].indexes`);
    return {
      backend: family.backend,
      pairPlan: leaf(family.pairPlan, `memberReferences.backendFamilies[${index}].pairPlan`),
      indexes: Object.fromEntries(BACKEND_INDEX_KEYS.map((key) => [
        key,
        leaf(family.indexes[key], `memberReferences.backendFamilies[${index}].indexes.${key}`)
      ]))
    };
  });
  const allReferences = [
    ...Object.values(direct),
    ...(qualificationEvidence ? [qualificationEvidence.index] : []),
    ...Object.values(experimentEvidence.indexes),
    ...backendMembers.flatMap((family) => [family.pairPlan, ...Object.values(family.indexes)])
  ];
  const paths = new Set();
  const aliases = new Set();
  for (const reference of allReferences) {
    const alias = reference.relativePath.normalize('NFC').toLocaleLowerCase('en-US');
    if (paths.has(reference.relativePath) || aliases.has(alias)) fail('memberReferences contains a duplicate or aliased path');
    if (reference.relativePath === PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE) fail('manifest cannot reference itself');
    paths.add(reference.relativePath);
    aliases.add(alias);
  }
  return { ...direct, qualificationEvidence, experimentEvidence, backendFamilies: backendMembers };
}

function manifestBody(value) {
  exact(value, [
    'schemaVersion', 'mode', 'finalizationPurpose', 'evaluationContext', 'semanticAuthority',
    'evidenceProvenance', 'backendFamilies', 'pairPlansChecksum', 'memberReferences'
  ], 'raw capture manifest');
  if (value.schemaVersion !== PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION) fail('raw capture manifest schema version is invalid');
  if (!MODES.has(value.mode)) fail('raw capture manifest mode is invalid');
  if (!PURPOSES.has(value.finalizationPurpose)) fail('raw capture manifest finalizationPurpose is invalid');
  const evaluationContext = validateEvaluationContext(value.evaluationContext);
  if ((value.mode === 'ci-core') !== (evaluationContext.experimentRole === 'ci-integrity')) fail('manifest mode and experiment role disagree');
  const semanticAuthority = validateSemanticAuthority(value.semanticAuthority);
  const evidenceProvenance = validateEvidenceProvenance(value.evidenceProvenance, value.finalizationPurpose);
  if (!Array.isArray(value.backendFamilies) || value.backendFamilies.length < 1 || value.backendFamilies.length > 2) {
    fail('backendFamilies must contain Canvas and optional WebGPU');
  }
  const backendFamilies = [...value.backendFamilies];
  backendFamilies.forEach((backend, index) => {
    if (backend !== BACKEND_ORDER[index]) fail('backendFamilies must be policy ordered');
  });
  sha(value.pairPlansChecksum, 'raw capture manifest pairPlansChecksum');
  const memberReferences = validateMemberReferences(value.memberReferences, backendFamilies, value.mode);
  return {
    schemaVersion: PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION,
    mode: value.mode,
    finalizationPurpose: value.finalizationPurpose,
    evaluationContext,
    semanticAuthority,
    evidenceProvenance,
    backendFamilies,
    pairPlansChecksum: value.pairPlansChecksum,
    memberReferences
  };
}

export function createPerformanceRawCaptureManifest(input) {
  const normalized = manifestBody({ schemaVersion: PERFORMANCE_RAW_CAPTURE_MANIFEST_SCHEMA_VERSION, ...input });
  return freeze({ ...normalized, checksum: canonicalSha256(normalized) });
}

export function validatePerformanceRawCaptureManifest(value) {
  exact(value, [
    'schemaVersion', 'mode', 'finalizationPurpose', 'evaluationContext', 'semanticAuthority',
    'evidenceProvenance', 'backendFamilies', 'pairPlansChecksum', 'memberReferences', 'checksum'
  ], 'raw capture manifest');
  sha(value.checksum, 'raw capture manifest checksum');
  const normalized = manifestBody(Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'checksum')));
  if (value.checksum !== canonicalSha256(normalized)) fail('raw capture manifest checksum does not match its canonical body');
  return freeze({ ...normalized, checksum: value.checksum });
}

export async function writePerformanceRawCaptureManifest({ outputDirectory, ...input } = {}) {
  text(outputDirectory, 'raw capture manifest outputDirectory');
  const manifest = createPerformanceRawCaptureManifest(input);
  const root = path.resolve(outputDirectory);
  await fs.mkdir(root, { recursive: true });
  const absolutePath = path.join(root, PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE);
  await fs.writeFile(absolutePath, `${stableStringify(manifest)}\n`, { encoding: 'utf8', flag: 'wx' });
  return freeze({ manifest, absolutePath, relativePath: PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE });
}

function validateIndexEntry(entry, captureKind, context, label) {
  if (captureKind === 'experiment-environment') {
    exact(entry, ['scopeKind', 'scopeId', 'relativePath', 'checksum'], label);
    if (entry.scopeKind !== 'experiment' || entry.scopeId !== context.experimentId) fail(`${label} has an invalid experiment scope`);
  } else if (captureKind === 'transport' || captureKind === 'qualification') {
    exact(entry, ['ledgerSequence', 'operationId', 'observationBoundaryId', 'relativePath', 'checksum'], label);
    integer(entry.ledgerSequence, `${label}.ledgerSequence`, 1);
    text(entry.operationId, `${label}.operationId`);
    text(entry.observationBoundaryId, `${label}.observationBoundaryId`);
  } else if (captureKind === 'metric-session') {
    exact(entry, ['metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex', 'relativePath', 'checksum'], label);
    text(entry.metricSessionId, `${label}.metricSessionId`);
    text(entry.comparisonKind, `${label}.comparisonKind`);
    if (entry.backend !== context.backend) fail(`${label}.backend does not match its index`);
    integer(entry.pairIndex, `${label}.pairIndex`, 1);
    integer(entry.attemptIndex, `${label}.attemptIndex`, 1);
  } else {
    exact(entry, [
      'runId', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex',
      'comparisonSide', 'buildVariant', 'launchOrdinal', 'externalExecutionId',
      'observationBoundaryId', 'relativePath', 'checksum'
    ], label);
    text(entry.runId, `${label}.runId`);
    text(entry.metricSessionId, `${label}.metricSessionId`);
    text(entry.comparisonKind, `${label}.comparisonKind`);
    if (entry.backend !== context.backend) fail(`${label}.backend does not match its index`);
    integer(entry.pairIndex, `${label}.pairIndex`, 1);
    integer(entry.attemptIndex, `${label}.attemptIndex`, 1);
    if (!['A', 'B'].includes(entry.comparisonSide)) fail(`${label}.comparisonSide is invalid`);
    text(entry.buildVariant, `${label}.buildVariant`);
    integer(entry.launchOrdinal, `${label}.launchOrdinal`, 1);
    uuid(entry.externalExecutionId, `${label}.externalExecutionId`);
    text(entry.observationBoundaryId, `${label}.observationBoundaryId`);
  }
  const normalized = { ...entry, relativePath: relativePath(entry.relativePath, `${label}.relativePath`) };
  sha(entry.checksum, `${label}.checksum`);
  return normalized;
}

function entrySortKey(entry, captureKind) {
  if (captureKind === 'experiment-environment') return `${entry.scopeKind}\0${entry.scopeId}`;
  if (captureKind === 'transport' || captureKind === 'qualification') return String(entry.ledgerSequence).padStart(16, '0');
  if (captureKind === 'metric-session') return `${entry.backend}\0${entry.comparisonKind}\0${String(entry.pairIndex).padStart(4, '0')}\0${String(entry.attemptIndex).padStart(4, '0')}`;
  return `${entry.backend}\0${entry.comparisonKind}\0${String(entry.pairIndex).padStart(4, '0')}\0${String(entry.attemptIndex).padStart(4, '0')}\0${entry.comparisonSide}`;
}

export function validatePerformanceCaptureIndex(value, context = {}) {
  if (!isObject(value)) fail('capture index must be an object');
  const backendIndex = !['experiment-environment', 'transport', 'qualification'].includes(value.captureKind);
  exact(value, backendIndex
    ? ['schemaVersion', 'experimentId', 'captureKind', 'sourceSha', 'policyHash', 'backend', 'pairPlanChecksum', 'entryCount', 'entries', 'checksum']
    : ['schemaVersion', 'experimentId', 'captureKind', 'entryCount', 'entries', 'checksum'], 'capture index');
  const registry = PERFORMANCE_CAPTURE_KIND_REGISTRY[value.captureKind];
  if (!registry || value.schemaVersion !== registry.indexVersion) fail('capture index kind or schema version is invalid');
  uuid(value.experimentId, 'capture index experimentId');
  if (context.experimentId && value.experimentId !== context.experimentId) fail('capture index experimentId does not match the manifest');
  const normalizedContext = { experimentId: value.experimentId };
  if (backendIndex) {
    sha(value.sourceSha, 'capture index sourceSha', 40);
    sha(value.policyHash, 'capture index policyHash');
    if (!BACKEND_ORDER.includes(value.backend)) fail('capture index backend is invalid');
    sha(value.pairPlanChecksum, 'capture index pairPlanChecksum');
    Object.assign(normalizedContext, { backend: value.backend });
    if (context.sourceSha && value.sourceSha !== context.sourceSha) fail('capture index sourceSha does not match the manifest');
    if (context.policyHash && value.policyHash !== context.policyHash) fail('capture index policyHash does not match the manifest');
    if (context.backend && value.backend !== context.backend) fail('capture index backend does not match its member');
    if (context.pairPlanChecksum && value.pairPlanChecksum !== context.pairPlanChecksum) fail('capture index pairPlanChecksum does not match its plan');
  }
  integer(value.entryCount, 'capture index entryCount');
  if (!Array.isArray(value.entries) || value.entries.length !== value.entryCount) fail('capture index entryCount does not match entries');
  const entries = value.entries.map((entry, index) => validateIndexEntry(entry, value.captureKind, normalizedContext, `capture index entries[${index}]`));
  const keys = entries.map((entry) => entrySortKey(entry, value.captureKind));
  if (keys.some((key, index) => index > 0 && compareText(keys[index - 1], key) >= 0)) fail('capture index entries are not canonical and unique');
  const paths = new Set(entries.map((entry) => entry.relativePath));
  if (paths.size !== entries.length) fail('capture index contains a duplicate capture path');
  const body = {
    schemaVersion: value.schemaVersion,
    experimentId: value.experimentId,
    captureKind: value.captureKind,
    ...(backendIndex ? {
      sourceSha: value.sourceSha,
      policyHash: value.policyHash,
      backend: value.backend,
      pairPlanChecksum: value.pairPlanChecksum
    } : {}),
    entryCount: value.entryCount,
    entries
  };
  sha(value.checksum, 'capture index checksum');
  if (value.checksum !== canonicalSha256(body)) fail('capture index checksum does not match its canonical body');
  return freeze({ ...body, checksum: value.checksum });
}

export function createPerformanceCaptureIndex(input, context = {}) {
  if (!isObject(input) || 'checksum' in input) fail('capture index input must be an exact body without checksum');
  return validatePerformanceCaptureIndex({ ...clone(input, 'capture index input'), checksum: canonicalSha256(input) }, context);
}

function validateBuildManifest(value, context) {
  exact(value, ['schemaVersion', 'sourceSha', 'variants'], 'build manifest');
  if (value.schemaVersion !== 2 || value.sourceSha !== context.sourceSha) fail('build manifest schema or source identity is invalid');
  if (!Array.isArray(value.variants) || value.variants.length !== BUILD_VARIANTS.length) fail('build manifest must contain all build variants');
  const variants = value.variants.map((variant, index) => {
    exact(variant, ['id', 'harness', 'instrumentation', 'bundle'], `build manifest variants[${index}]`);
    const expected = BUILD_VARIANTS[index];
    if (variant.id !== expected.id || variant.harness !== expected.harness || variant.instrumentation !== expected.instrumentation) {
      fail('build manifest variant order or flags are invalid');
    }
    exact(variant.bundle, ['sha256', 'entries'], `build manifest variants[${index}].bundle`);
    if (!Array.isArray(variant.bundle.entries) || variant.bundle.entries.length === 0) fail('build bundle entries must be nonempty');
    const entries = variant.bundle.entries.map((entry, entryIndex) => {
      exact(entry, ['path', 'bytes', 'sha256'], `build manifest variants[${index}].bundle.entries[${entryIndex}]`);
      const entryPath = relativePath(entry.path, `build manifest variants[${index}].bundle.entries[${entryIndex}].path`);
      integer(entry.bytes, `build manifest variants[${index}].bundle.entries[${entryIndex}].bytes`);
      sha(entry.sha256, `build manifest variants[${index}].bundle.entries[${entryIndex}].sha256`);
      return { path: entryPath, bytes: entry.bytes, sha256: entry.sha256 };
    });
    if (entries.some((entry, entryIndex) => entryIndex > 0 && compareText(entries[entryIndex - 1].path, entry.path) >= 0)) {
      fail('build bundle entries must be uniquely path sorted');
    }
    sha(variant.bundle.sha256, `build manifest variants[${index}].bundle.sha256`);
    if (variant.bundle.sha256 !== canonicalSha256(entries)) fail('build bundle aggregate checksum is invalid');
    return { ...expected, bundle: { sha256: variant.bundle.sha256, entries } };
  });
  return freeze({ schemaVersion: 2, sourceSha: value.sourceSha, variants });
}

function validateProductionBundleEvidence(value, context, buildManifest) {
  exact(value, ['schemaVersion', 'sourceSha', 'build', 'codeByteTotal', 'codeRoots', 'checksum'], 'production bundle evidence');
  if (value.schemaVersion !== 1 || value.sourceSha !== context.sourceSha) fail('production bundle evidence identity is invalid');
  exact(value.build, ['id', 'harness', 'instrumentation', 'bundleSha256'], 'production bundle evidence build');
  if (value.build.id !== 'production' || value.build.harness !== false || value.build.instrumentation !== false
    || value.build.bundleSha256 !== buildManifest.variants[0].bundle.sha256) fail('production bundle evidence build is invalid');
  const rootIds = ['main', 'preload', 'renderer', 'worker'];
  const entrypointPatterns = {
    main: /^main\/index\.js$/,
    preload: /^preload\/index\.js$/,
    renderer: /^renderer\/assets\/main-[A-Za-z0-9_-]+\.js$/,
    worker: /^renderer\/assets\/worker-entry-[A-Za-z0-9_-]+\.js$/
  };
  const classifyRoot = (entryPath) => {
    if (entryPath.startsWith('main/')) return 'main';
    if (entryPath.startsWith('preload/')) return 'preload';
    if (entrypointPatterns.worker.test(entryPath)) return 'worker';
    if (entryPath.startsWith('renderer/')) return 'renderer';
    fail(`production JavaScript entry ${entryPath} does not belong to a registered code root`);
  };
  if (!Array.isArray(value.codeRoots) || value.codeRoots.length !== rootIds.length) fail('production bundle evidence codeRoots is invalid');
  const bundleEntries = new Map(buildManifest.variants[0].bundle.entries.map((entry) => [entry.path, entry]));
  const seenEntries = new Set();
  let codeByteTotal = 0;
  const codeRoots = value.codeRoots.map((root, index) => {
    exact(root, ['id', 'entrypoint', 'byteTotal', 'entries', 'sha256'], `production bundle evidence codeRoots[${index}]`);
    if (root.id !== rootIds[index]) fail('production bundle evidence root order is invalid');
    exact(root.entrypoint, ['path', 'bytes', 'sha256'], `production bundle evidence codeRoots[${index}].entrypoint`);
    if (!entrypointPatterns[root.id].test(root.entrypoint.path)) fail('production code root entrypoint is invalid');
    if (!Array.isArray(root.entries) || root.entries.length === 0) fail('production code root entries must be nonempty');
    const entries = root.entries.map((entry, entryIndex) => {
      exact(entry, ['path', 'bytes', 'sha256'], `production bundle evidence codeRoots[${index}].entries[${entryIndex}]`);
      const expected = bundleEntries.get(entry.path);
      if (!expected || stableStringify(expected) !== stableStringify(entry) || seenEntries.has(entry.path)) fail('production code root entry is invalid or duplicated');
      if (!/\.(?:c|m)?js$/.test(entry.path)) fail('production code root entry is not JavaScript');
      if (classifyRoot(entry.path) !== root.id) fail('production JavaScript entry is assigned to the wrong code root');
      seenEntries.add(entry.path);
      return { ...entry };
    });
    if (entries.some((entry, entryIndex) => entryIndex > 0 && compareText(entries[entryIndex - 1].path, entry.path) >= 0)) fail('production code root entries are not sorted');
    if (entries.filter((entry) => stableStringify(entry) === stableStringify(root.entrypoint)).length !== 1) {
      fail('production code root entrypoint is not a unique exact member of its entries');
    }
    const byteTotal = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    if (root.byteTotal !== byteTotal || root.sha256 !== canonicalSha256(entries)) fail('production code root totals or checksum are invalid');
    codeByteTotal += byteTotal;
    return { id: root.id, entrypoint: { ...root.entrypoint }, byteTotal, entries, sha256: root.sha256 };
  });
  const jsEntries = buildManifest.variants[0].bundle.entries.filter((entry) => /\.(?:c|m)?js$/.test(entry.path));
  if (seenEntries.size !== jsEntries.length || value.codeByteTotal !== codeByteTotal) fail('production JavaScript root coverage or codeByteTotal is invalid');
  const body = { schemaVersion: 1, sourceSha: value.sourceSha, build: { ...value.build }, codeByteTotal, codeRoots };
  if (value.checksum !== canonicalSha256(body)) fail('production bundle evidence checksum is invalid');
  return freeze({ ...body, checksum: value.checksum });
}

function validateBuildCommandLedger(value, context) {
  exact(value, ['schemaVersion', 'sourceSha', 'entries'], 'build command ledger');
  if (value.schemaVersion !== 1 || value.sourceSha !== context.sourceSha) fail('build command ledger identity is invalid');
  if (!Array.isArray(value.entries) || value.entries.length !== 3) fail('build command ledger requires three entries');
  value.entries.forEach((entry, index) => {
    if (!isObject(entry) || entry.sequence !== index + 1 || entry.operationId !== 'build-spawn' || entry.buildId !== BUILD_VARIANTS[index].id) {
      fail('build command ledger sequence is invalid');
    }
  });
  return freeze(clone(value, 'build command ledger'));
}

function validateReferencedPerformanceLedger(value, manifest) {
  if (!Array.isArray(value)) fail('performance ledger must be an array');
  if (value.length === 0) {
    if (manifest.finalizationPurpose === 'publication') fail('publication performance ledger must not be empty');
    return freeze([]);
  }
  try {
    return freeze(clone(validatePerformanceLedger(value), 'performance ledger'));
  } catch (error) {
    fail(`performance ledger is not a valid closed transaction: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateRawKinds(value, label, capture) {
  if (!Array.isArray(value) || value.length === 0) fail(`${label} must be a nonempty array`);
  const allowed = new Set(performanceRawKindsForCapture({
    captureKind: capture.captureKind,
    scopeKind: capture.scopeKind,
    buildVariant: capture.buildVariant,
    purpose: capture.purpose
  }));
  let previousOrder = -1;
  const groups = value.map((group, index) => {
    exact(group, ['rawKind', 'rows'], `${label}[${index}]`);
    const rawOrder = PERFORMANCE_RAW_KIND_ORDER.indexOf(group.rawKind);
    if (rawOrder <= previousOrder || !allowed.has(group.rawKind)) fail(`${label} must be unique, registry ordered, and attributed to ${capture.captureKind}`);
    previousOrder = rawOrder;
    if (!Array.isArray(group.rows) || group.rows.length === 0) fail(`${label}[${index}].rows must be nonempty`);
    const rows = group.rows.map((row, rowIndex) => {
      const normalized = validatePerformanceScopedRawRow(row, group.rawKind, capture.scopeKind, {
        label: `${label}[${index}].rows[${rowIndex}]`
      });
      const expected = {
        sourceSha: capture.sourceSha,
        policyHash: capture.policyHash,
        experimentId: capture.experimentId,
        scopeKind: capture.scopeKind,
        scopeId: capture.scopeId,
        captureKind: capture.captureKind,
        ...(capture.experimentRole === undefined ? {} : { experimentRole: capture.experimentRole }),
        ...(capture.ledgerSequence === undefined ? {} : { ledgerSequence: capture.ledgerSequence }),
        ...(capture.observationBoundaryId === undefined ? {} : { observationBoundaryId: capture.observationBoundaryId })
      };
      for (const [key, expectedValue] of Object.entries(expected)) {
        if (key in normalized && normalized[key] !== expectedValue) fail(`${label}[${index}].rows[${rowIndex}].${key} does not match its wrapper`);
      }
      return normalized;
    });
    return { rawKind: group.rawKind, rows };
  });
  validatePerformanceCaptureRawGrammar(groups, {
    captureKind: capture.captureKind,
    scopeKind: capture.scopeKind,
    label
  });
  return groups;
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) fail(`${label} must be a finite number >= ${minimum}`);
}

function validateQualificationAdapterIdentity(value, label) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.adapterIdentityFields, label);
  for (const field of policy.adapterIdentityFields) {
    if (value[field] !== null && typeof value[field] !== 'string') fail(`${label}.${field} must be a string or null`);
  }
  return clone(value, label);
}

function validateQualificationLimits(value, label) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.limitFields, label);
  for (const field of policy.limitFields) integer(value[field], `${label}.${field}`, 1);
  return clone(value, label);
}

function validateQualificationBackendIdentity(value, label) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.backendExecutionIdentityFields, label);
  if (value.backend !== 'webgpu' || value.driver !== 'webgpu-driver-v1'
    || value.workerProtocol !== 'webgpu-worker-ready-v1'
    || !['low-power', 'high-performance'].includes(value.powerPreference)
    || typeof value.isFallbackAdapter !== 'boolean') fail(`${label} has an invalid WebGPU execution discriminator`);
  return {
    backend: value.backend,
    driver: value.driver,
    workerProtocol: value.workerProtocol,
    adapterIdentity: validateQualificationAdapterIdentity(value.adapterIdentity, `${label}.adapterIdentity`),
    limits: validateQualificationLimits(value.limits, `${label}.limits`),
    isFallbackAdapter: value.isFallbackAdapter,
    powerPreference: value.powerPreference
  };
}

function validateQualificationCapability(value, label) {
  const statuses = BASELINE_POLICY.performanceQualificationCapturePolicy.capabilityStatuses;
  if (!isObject(value) || typeof value.status !== 'string') fail(`${label} must have a status discriminator`);
  if (statuses.available.includes(value.status)) {
    exact(value, BASELINE_POLICY.performanceQualificationCapturePolicy.availableCapabilityResultFields, label);
    if (typeof value.isFallbackAdapter !== 'boolean') fail(`${label}.isFallbackAdapter must be boolean`);
    exact(value.strictSelection, BASELINE_POLICY.performanceQualificationCapturePolicy.strictSelectionFields, `${label}.strictSelection`);
    if (value.strictSelection.requestedBackend !== 'webgpu' || value.strictSelection.powerPreference !== 'low-power'
      || value.strictSelection.forceFallbackAdapter !== false) fail(`${label}.strictSelection is invalid`);
    return {
      status: value.status,
      adapterIdentity: validateQualificationAdapterIdentity(value.adapterIdentity, `${label}.adapterIdentity`),
      limits: validateQualificationLimits(value.limits, `${label}.limits`),
      isFallbackAdapter: value.isFallbackAdapter,
      strictSelection: { ...value.strictSelection }
    };
  }
  if (statuses.unavailable.includes(value.status)) {
    exact(value, BASELINE_POLICY.performanceQualificationCapturePolicy.statusOnlyResultFields, label);
    return { status: value.status };
  }
  if (statuses.fatal.includes(value.status)) {
    exact(value, BASELINE_POLICY.performanceQualificationCapturePolicy.errorResultFields, label);
    exact(value.error, BASELINE_POLICY.performanceQualificationCapturePolicy.errorFields, `${label}.error`);
    text(value.error.name, `${label}.error.name`);
    text(value.error.message, `${label}.error.message`);
    fail(`${label} fatal capability results are not publishable`);
  }
  fail(`${label}.status is not registered`);
}

function validateQualificationTransfer(value, label) {
  const statuses = BASELINE_POLICY.performanceQualificationCapturePolicy.transferStatuses;
  if (!isObject(value) || typeof value.status !== 'string') fail(`${label} must have a status discriminator`);
  if ([...statuses.available, ...statuses.unavailable].includes(value.status)) {
    exact(value, BASELINE_POLICY.performanceQualificationCapturePolicy.statusOnlyResultFields, label);
    return { status: value.status };
  }
  if (statuses.fatal.includes(value.status)) {
    exact(value, BASELINE_POLICY.performanceQualificationCapturePolicy.errorResultFields, label);
    exact(value.error, BASELINE_POLICY.performanceQualificationCapturePolicy.errorFields, `${label}.error`);
    text(value.error.name, `${label}.error.name`);
    text(value.error.message, `${label}.error.message`);
    fail(`${label} fatal transfer results are not publishable`);
  }
  fail(`${label}.status is not registered`);
}

function validateQualificationReadiness(value, label) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.readinessEvidenceFields, label);
  if (!Array.isArray(value.stages) || value.stages.length === 0) fail(`${label}.stages must be nonempty`);
  const stages = value.stages.map((stage, index) => {
    const stageLabel = `${label}.stages[${index}]`;
    exact(stage, policy.readinessStageFields, stageLabel);
    if (!['webgpu', 'canvas2d'].includes(stage.backend)) fail(`${stageLabel}.backend is invalid`);
    finite(stage.backendReadyObservedAt, `${stageLabel}.backendReadyObservedAt`);
    integer(stage.sourceSequence, `${stageLabel}.sourceSequence`, 1);
    finite(stage.sourceObservedAt, `${stageLabel}.sourceObservedAt`, stage.backendReadyObservedAt);
    if (stage.backend === 'canvas2d') {
      exact(stage.terminalFrame, policy.canvasTerminalFrameFields, `${stageLabel}.terminalFrame`);
      if (stage.terminalFrame.kind !== 'canvas-draw-completed' || stage.terminalFrame.outcome !== 'canvas-draw-completed') {
        fail(`${stageLabel}.terminalFrame is not a Canvas terminal frame`);
      }
      finite(stage.terminalFrame.observedAt, `${stageLabel}.terminalFrame.observedAt`, stage.sourceObservedAt);
    } else {
      exact(stage.terminalFrame, policy.webgpuTerminalFrameFields, `${stageLabel}.terminalFrame`);
      if (stage.terminalFrame.kind !== 'worker-frame-acknowledged'
        || stage.terminalFrame.outcome !== 'webgpu-queue-submit-completed') fail(`${stageLabel}.terminalFrame is not a WebGPU acknowledgement`);
      integer(stage.terminalFrame.frameToken, `${stageLabel}.terminalFrame.frameToken`, 1);
      finite(stage.terminalFrame.submittedAt, `${stageLabel}.terminalFrame.submittedAt`, stage.sourceObservedAt);
      finite(stage.terminalFrame.acknowledgedAt, `${stageLabel}.terminalFrame.acknowledgedAt`, stage.terminalFrame.submittedAt);
    }
    return clone(stage, stageLabel);
  });
  return { stages };
}

function validateQualificationCleanup(value, label) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.cleanupFields, label);
  if (!Array.isArray(value.controllerFatalReasons) || value.controllerFatalReasons.length !== 0
    || value.listenersRemoved !== true || value.restorationOutcome !== 'restored') fail(`${label} is not a successful cleanup`);
  for (const field of ['applicationDescendantClosureEnd', 'brokerDisposeEnd', 'rootExitObservedAt', 'terminalClosureEnd']) {
    finite(value[field], `${label}.${field}`);
  }
  if (value.applicationDescendantClosureEnd > value.brokerDisposeEnd
    || value.brokerDisposeEnd > value.rootExitObservedAt
    || value.rootExitObservedAt > value.terminalClosureEnd) fail(`${label} closure timestamps are not monotonic`);
  return clone(value, label);
}

function validateQualificationBody(value, wrapper) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(value, policy.captureBodyFields, 'qualification capture body');
  if (value.schemaVersion !== 1 || value.buildVariant !== 'harness-control' || value.requestedBackend !== 'webgpu') {
    fail('qualification capture body constants are invalid');
  }
  for (const key of ['experimentId', 'ledgerSequence', 'observationBoundaryId', 'sourceSha', 'policyHash']) {
    if (value[key] !== wrapper[key]) fail(`qualification capture body ${key} does not match its wrapper`);
  }
  const capabilityResult = validateQualificationCapability(value.capabilityResult, 'qualification capture body.capabilityResult');
  const transferResult = validateQualificationTransfer(value.transferResult, 'qualification capture body.transferResult');
  const readinessEvidence = validateQualificationReadiness(value.readinessEvidence, 'qualification capture body.readinessEvidence');
  const cleanup = validateQualificationCleanup(value.cleanup, 'qualification capture body.cleanup');
  exact(value.selectionResult, policy.selectionResultFields, 'qualification capture body.selectionResult');
  const selection = value.selectionResult;
  if (!policy.qualificationStates.includes(selection.qualificationState)
    || !policy.unavailabilityBranches.includes(selection.unavailabilityBranch)
    || !policy.selectionReasons.includes(selection.selectionReason)
    || selection.requestedBackend !== 'webgpu'
    || !['webgpu', 'canvas2d'].includes(selection.selectedBackend)
    || !['webgpu', 'canvas2d'].includes(selection.observedBackend)) fail('qualification selectionResult is invalid');
  const branchByStatus = {
    'api-unavailable': 'webgpu-api-unavailable',
    'adapter-unavailable': 'webgpu-adapter-unavailable'
  };
  const transferBranchByStatus = {
    'api-unavailable': 'transfer-api-unavailable',
    'method-unavailable': 'transfer-method-unavailable',
    'allowlisted-not-supported': 'transfer-allowlisted-not-supported'
  };
  const unavailableBranch = branchByStatus[capabilityResult.status] ?? transferBranchByStatus[transferResult.status] ?? null;
  let adapterIdentity = null;
  let fallbackState = null;
  let backendExecutionIdentity = null;
  if (unavailableBranch !== null) {
    if (selection.qualificationState !== 'hardware-capability-unavailable' || selection.unavailabilityBranch !== unavailableBranch
      || selection.selectionReason !== unavailableBranch || selection.selectedBackend !== 'canvas2d' || selection.observedBackend !== 'canvas2d'
      || value.adapterIdentity !== null || value.fallbackState !== null || value.backendExecutionIdentity !== null
      || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['canvas2d'])) {
      fail('qualification pre-worker unavailability branch is inconsistent');
    }
  } else {
    if (capabilityResult.status !== 'available' || transferResult.status !== 'available') fail('qualification result has no valid selection branch');
    adapterIdentity = validateQualificationAdapterIdentity(value.adapterIdentity, 'qualification capture body.adapterIdentity');
    if (stableStringify(adapterIdentity) !== stableStringify(capabilityResult.adapterIdentity)) fail('qualification adapterIdentity does not match the live capability result');
    if (capabilityResult.isFallbackAdapter) {
      exact(value.fallbackState, policy.unavailableFallbackStateFields, 'qualification capture body.fallbackState');
      if (value.fallbackState.isFallbackAdapter !== true || value.fallbackState.branch !== 'worker-fallback-adapter'
        || value.fallbackState.fallbackBackend !== 'canvas2d' || value.backendExecutionIdentity !== null
        || selection.qualificationState !== 'hardware-capability-unavailable' || selection.unavailabilityBranch !== 'worker-fallback-adapter'
        || selection.selectionReason !== 'worker-fallback-adapter' || selection.selectedBackend !== 'canvas2d' || selection.observedBackend !== 'webgpu'
        || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['webgpu', 'canvas2d'])) {
        fail('qualification worker fallback branch is inconsistent');
      }
      fallbackState = {
        isFallbackAdapter: true,
        branch: value.fallbackState.branch,
        observedBackendExecutionIdentity: validateQualificationBackendIdentity(value.fallbackState.observedBackendExecutionIdentity, 'qualification capture body.fallbackState.observedBackendExecutionIdentity'),
        fallbackBackend: value.fallbackState.fallbackBackend
      };
      if (fallbackState.observedBackendExecutionIdentity.isFallbackAdapter !== true) fail('qualification fallback READY identity is not a fallback adapter');
    } else {
      exact(value.fallbackState, policy.qualifiedFallbackStateFields, 'qualification capture body.fallbackState');
      if (value.fallbackState.isFallbackAdapter !== false || value.fallbackState.branch !== null
        || selection.qualificationState !== 'qualified-webgpu' || selection.unavailabilityBranch !== 'none'
        || selection.selectionReason !== 'webgpu-selected' || selection.selectedBackend !== 'webgpu' || selection.observedBackend !== 'webgpu'
        || stableStringify(readinessEvidence.stages.map((stage) => stage.backend)) !== stableStringify(['webgpu'])) {
        fail('qualified WebGPU branch is inconsistent');
      }
      fallbackState = { isFallbackAdapter: false, branch: null };
      backendExecutionIdentity = validateQualificationBackendIdentity(value.backendExecutionIdentity, 'qualification capture body.backendExecutionIdentity');
      if (backendExecutionIdentity.isFallbackAdapter !== false || backendExecutionIdentity.powerPreference !== 'low-power') {
        fail('qualified WebGPU READY identity violates strict selection');
      }
    }
    const observedIdentity = backendExecutionIdentity ?? fallbackState.observedBackendExecutionIdentity;
    if (stableStringify(observedIdentity.adapterIdentity) !== stableStringify(capabilityResult.adapterIdentity)
      || stableStringify(observedIdentity.limits) !== stableStringify(capabilityResult.limits)) {
      fail('qualification READY identity does not match the live capability oracle');
    }
  }
  return {
    schemaVersion: 1,
    experimentId: value.experimentId,
    ledgerSequence: value.ledgerSequence,
    observationBoundaryId: value.observationBoundaryId,
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    buildVariant: value.buildVariant,
    requestedBackend: value.requestedBackend,
    readinessEvidence,
    capabilityResult,
    transferResult,
    selectionResult: clone(selection, 'qualification capture body.selectionResult'),
    adapterIdentity,
    fallbackState,
    backendExecutionIdentity,
    cleanup
  };
}

function validateGenericCapture(value, captureKind, context) {
  let captureBody;
  if (captureKind === 'experiment-environment') {
    exact(value, ['schemaVersion', 'experimentId', 'sourceSha', 'policyHash', 'scopeKind', 'rawKinds', 'checksum'], 'experiment environment capture');
    if (value.scopeKind !== 'experiment') fail('experiment environment capture scopeKind is invalid');
  } else if (captureKind === 'transport') {
    exact(value, ['schemaVersion', 'experimentId', 'sourceSha', 'policyHash', 'captureKind', 'ledgerSequence', 'operationId', 'observationBoundaryId', 'rawKinds', 'checksum'], 'transport capture');
    if (value.captureKind !== captureKind) fail('transport capture kind is invalid');
    integer(value.ledgerSequence, 'transport capture ledgerSequence', 1);
    text(value.operationId, 'transport capture operationId');
    text(value.observationBoundaryId, 'transport capture observationBoundaryId');
  } else {
    exact(value, ['schemaVersion', 'experimentId', 'sourceSha', 'policyHash', 'captureKind', 'ledgerSequence', 'observationBoundaryId', 'captureBody', 'captureBodyChecksum', 'rawKinds', 'checksum'], 'qualification capture');
    if (value.captureKind !== captureKind) fail('qualification capture kind is invalid');
    integer(value.ledgerSequence, 'qualification capture ledgerSequence', 1);
    text(value.observationBoundaryId, 'qualification capture observationBoundaryId');
    captureBody = validateQualificationBody(value.captureBody, value);
    sha(value.captureBodyChecksum, 'qualification capture body checksum');
    if (value.captureBodyChecksum !== canonicalSha256(captureBody)) fail('qualification capture body checksum is invalid');
  }
  if (value.schemaVersion !== PERFORMANCE_CAPTURE_KIND_REGISTRY[captureKind].captureVersion) fail(`${captureKind} capture schemaVersion is invalid`);
  if (value.experimentId !== context.experimentId || value.sourceSha !== context.sourceSha || value.policyHash !== context.policyHash) {
    fail(`${captureKind} capture identity does not match the manifest`);
  }
  const rawKinds = validateRawKinds(value.rawKinds, `${captureKind} rawKinds`, {
    captureKind,
    scopeKind: captureKind === 'experiment-environment' ? 'experiment' : 'ledger-operation',
    scopeId: captureKind === 'experiment-environment' ? value.experimentId : value.ledgerSequence,
    sourceSha: value.sourceSha,
    policyHash: value.policyHash,
    experimentId: value.experimentId,
    ledgerSequence: value.ledgerSequence,
    observationBoundaryId: value.observationBoundaryId,
    experimentRole: context.experimentRole,
    purpose: captureKind === 'experiment-environment'
      ? 'experiment-monitor'
      : captureKind === 'qualification'
        ? 'qualification-probe'
        : value.operationId === 'generic-transport-spawn'
          ? 'generic-transport-probe'
          : 'electron-transport-probe',
    buildVariant: captureKind === 'experiment-environment' || value.operationId === 'generic-transport-spawn'
      ? null
      : 'harness-control'
  });
  const body = { ...value, ...(captureKind === 'qualification' ? { captureBody } : {}), rawKinds };
  delete body.checksum;
  sha(value.checksum, `${captureKind} capture checksum`);
  if (value.checksum !== canonicalSha256(body)) fail(`${captureKind} capture checksum is invalid`);
  return freeze({ ...body, checksum: value.checksum });
}

function createGenericCapture(input, captureKind) {
  if (!isObject(input) || 'schemaVersion' in input || 'checksum' in input) fail(`${captureKind} capture input must omit schemaVersion and checksum`);
  const body = {
    schemaVersion: PERFORMANCE_CAPTURE_KIND_REGISTRY[captureKind].captureVersion,
    ...clone(input, `${captureKind} capture input`)
  };
  const context = { experimentId: body.experimentId, sourceSha: body.sourceSha, policyHash: body.policyHash };
  return validateGenericCapture({ ...body, checksum: canonicalSha256(body) }, captureKind, context);
}

export function createPerformanceExperimentEnvironmentCapture(input) {
  return createGenericCapture(input, 'experiment-environment');
}

export function createPerformanceTransportCapture(input) {
  return createGenericCapture(input, 'transport');
}

export function createPerformanceQualificationCapture(input) {
  return createGenericCapture(input, 'qualification');
}

export function validatePerformanceExperimentEnvironmentCapture(value) {
  return validateGenericCapture(value, 'experiment-environment', value);
}

export function validatePerformanceTransportCapture(value) {
  return validateGenericCapture(value, 'transport', value);
}

export function validatePerformanceQualificationCapture(value) {
  return validateGenericCapture(value, 'qualification', value);
}

function validateCapture(value, captureKind, context) {
  if (captureKind === 'sentinel') return validatePerformanceSentinelCapture(value);
  if (captureKind === 'external-metric') return validatePerformanceExternalMetricCapture(value);
  if (captureKind === 'workload') return validatePerformanceWorkloadCapture(value);
  if (captureKind === 'metric-session') return validatePerformanceMetricSessionCapture(value);
  return validateGenericCapture(value, captureKind, context);
}

function artifactChecksum(value) {
  if (isObject(value) && typeof value.checksum === 'string') {
    const body = { ...value };
    delete body.checksum;
    if (value.checksum !== canonicalSha256(body)) fail('referenced artifact has an invalid internal checksum');
    return value.checksum;
  }
  return canonicalSha256(value);
}

function createReadState(root, rootReal, manifestIdentity) {
  return {
    root,
    rootReal,
    paths: new Set([PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE]),
    aliases: new Set([PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE.toLocaleLowerCase('en-US')]),
    identities: new Set([manifestIdentity])
  };
}

async function readReference(state, reference, label) {
  const normalized = relativePath(reference.relativePath, `${label}.relativePath`);
  const alias = normalized.normalize('NFC').toLocaleLowerCase('en-US');
  if (state.paths.has(normalized) || state.aliases.has(alias)) fail(`${label} reuses or aliases another logical path`);
  state.paths.add(normalized);
  state.aliases.add(alias);
  const absolute = path.resolve(state.root, ...normalized.split('/'));
  const relative = path.relative(state.root, absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail(`${label} escapes the output directory`);
  let stat;
  try {
    stat = await fs.lstat(absolute);
  } catch (error) {
    fail(`${label} is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${label} must resolve directly to a regular file`);
  const real = await fs.realpath(absolute);
  const realRelative = path.relative(state.rootReal, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail(`${label} resolves outside the output directory`);
  const identity = `${stat.dev}:${stat.ino}`;
  if (state.identities.has(identity)) fail(`${label} aliases another file identity`);
  state.identities.add(identity);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(absolute, 'utf8'));
  } catch (error) {
    fail(`${label} is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (artifactChecksum(parsed) !== reference.checksum) fail(`${label} checksum does not match its reference`);
  return parsed;
}

function referenceForEntry(entry) {
  return { relativePath: entry.relativePath, checksum: entry.checksum };
}

const CANONICAL_RUN_JOIN_FIELDS = [
  'sourceSha', 'policyHash', 'experimentId', 'pairPlanChecksum', 'ledgerSequence',
  'experimentRole', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex',
  'attemptIndex', 'comparisonSide', 'buildVariant', 'ordinal', 'runId',
  'externalExecutionId', 'observationBoundaryId'
];

export function validatePerformanceManifestRunJoin(join, ledgerEntry) {
  for (const key of CANONICAL_RUN_JOIN_FIELDS) {
    const ledgerValue = key === 'ledgerSequence' ? ledgerEntry?.sequence : ledgerEntry?.[key];
    if (!ledgerEntry || ledgerValue !== join?.[key]) fail(`manifest run join changes canonical field ${key}`);
  }
  if (join.buildVariant === 'production') {
    if (ledgerEntry.browserPid !== join.browserPid || ledgerEntry.browserCreationTime !== join.browserCreationTime) {
      fail('manifest production run join changes its browser identity');
    }
  } else if (ledgerEntry.launchId !== join.launchId || ledgerEntry.executionId !== join.executionId) {
    fail('manifest harness run join changes its launch identity');
  }
  return true;
}

function assertCaptureEntry(capture, entry, captureKind, index = null, context = null) {
  if (captureKind === 'experiment-environment') return;
  if (captureKind === 'transport' || captureKind === 'qualification') {
    for (const key of ['ledgerSequence', 'observationBoundaryId']) {
      if (capture[key] !== entry[key]) fail(`${captureKind} capture ${key} does not match its index entry`);
    }
    if (captureKind === 'transport' && capture.operationId !== entry.operationId) fail('transport capture operationId does not match its index entry');
    for (const group of capture.rawKinds) {
      for (const row of group.rows) {
        if ('operationId' in row && row.operationId !== entry.operationId) fail(`${captureKind} raw row operationId does not match its index entry`);
      }
    }
    return;
  }
  const join = capture.join;
  const entryKeys = captureKind === 'metric-session'
    ? ['metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex']
    : ['runId', 'metricSessionId', 'comparisonKind', 'backend', 'pairIndex', 'attemptIndex', 'comparisonSide', 'buildVariant', 'externalExecutionId', 'observationBoundaryId'];
  for (const key of entryKeys) if (join[key] !== entry[key]) fail(`${captureKind} capture join ${key} does not match its index entry`);
  if (captureKind !== 'metric-session') {
    if (join.ordinal !== entry.launchOrdinal) fail(`${captureKind} capture launch ordinal does not match its index entry`);
    const indexJoin = {
      sourceSha: index?.sourceSha,
      policyHash: index?.policyHash,
      experimentId: index?.experimentId,
      pairPlanChecksum: index?.pairPlanChecksum,
      experimentRole: context?.experimentRole,
      backend: index?.backend
    };
    for (const [key, value] of Object.entries(indexJoin)) {
      if (join[key] !== value) fail(`${captureKind} capture canonical join ${key} does not match its index or manifest context`);
    }
  }
}

function validateExecutedTopology(family) {
  const plan = family.pairPlan;
  const metricEntries = family.indexes.metricSession.entries;
  const slotKey = (comparisonKind, pairIndex, attemptIndex) => `${comparisonKind}:${pairIndex}:${attemptIndex}`;
  const runSlotKey = (entry) => `${slotKey(entry.comparisonKind, entry.pairIndex, entry.attemptIndex)}:${entry.comparisonSide}`;
  const plannedSlots = new Map();
  for (const pair of plan.pairs) {
    for (const attempt of pair.attempts) plannedSlots.set(slotKey(pair.comparisonKind, pair.pairIndex, attempt.attemptIndex), { pair, attempt });
  }
  const metricSlots = new Map(metricEntries.map((entry) => [slotKey(entry.comparisonKind, entry.pairIndex, entry.attemptIndex), entry]));
  if (metricSlots.size !== metricEntries.length) fail('metric-session index has duplicate attempt slots');
  for (const pair of plan.pairs) {
    let observedGap = false;
    for (const attempt of pair.attempts) {
      const present = metricSlots.has(slotKey(pair.comparisonKind, pair.pairIndex, attempt.attemptIndex));
      if (!present) observedGap = true;
      else if (observedGap) fail('executed pair attempts are not a contiguous plan prefix');
      if (present && metricSlots.get(slotKey(pair.comparisonKind, pair.pairIndex, attempt.attemptIndex)).metricSessionId !== attempt.metricSessionId) {
        fail('metric-session index slot does not match its pair plan');
      }
    }
  }
  for (const [key, entry] of metricSlots) {
    const planned = plannedSlots.get(key);
    if (!planned || planned.attempt.metricSessionId !== entry.metricSessionId) fail('metric-session index contains an unplanned attempt slot');
  }
  const expectedRunEntries = (comparisonKind) => metricEntries.filter((entry) => entry.comparisonKind === comparisonKind).length * 2;
  if (family.indexes.externalMetric.entryCount !== metricEntries.length * 2
    || family.indexes.sentinel.entryCount !== expectedRunEntries('harness-overhead')
    || family.indexes.workload.entryCount !== expectedRunEntries('instrumentation-overhead')) {
    fail('backend capture index counts do not match the executed attempt prefix');
  }
  for (const [key, comparisonKind] of [['sentinel', 'harness-overhead'], ['workload', 'instrumentation-overhead']]) {
    if (family.indexes[key].entries.some((entry) => entry.comparisonKind !== comparisonKind)) fail(`${key} index contains the wrong comparison kind`);
  }
  const expectedRunSlots = new Map();
  for (const [key, metricEntry] of metricSlots) {
    const planned = plannedSlots.get(key);
    for (const launch of planned.attempt.launches) {
      expectedRunSlots.set(`${key}:${launch.comparisonSide}`, {
        metricSessionId: metricEntry.metricSessionId,
        buildVariant: launch.buildVariant,
        comparisonKind: planned.pair.comparisonKind
      });
    }
  }
  const observedGlobalIds = new Set();
  for (const [indexKey, expectedComparisonKind] of [
    ['externalMetric', null],
    ['sentinel', 'harness-overhead'],
    ['workload', 'instrumentation-overhead']
  ]) {
    const entries = family.indexes[indexKey].entries;
    const observedSlots = new Set();
    for (const entry of entries) {
      const key = runSlotKey(entry);
      const expected = expectedRunSlots.get(key);
      if (!expected || expected.metricSessionId !== entry.metricSessionId || expected.buildVariant !== entry.buildVariant
        || (expectedComparisonKind !== null && expected.comparisonKind !== expectedComparisonKind)) {
        fail(`${indexKey} index entry does not match one executed planned launch`);
      }
      if (observedSlots.has(key)) fail(`${indexKey} index contains a duplicate planned launch`);
      observedSlots.add(key);
      for (const [label, value] of [['runId', entry.runId], ['externalExecutionId', entry.externalExecutionId], ['observationBoundaryId', entry.observationBoundaryId]]) {
        const identity = `${indexKey}:${label}:${value}`;
        if (observedGlobalIds.has(identity)) fail(`${indexKey} index contains a duplicate ${label}`);
        observedGlobalIds.add(identity);
      }
    }
    const expectedSlots = [...expectedRunSlots.entries()]
      .filter(([, expected]) => expectedComparisonKind === null || expected.comparisonKind === expectedComparisonKind)
      .map(([key]) => key);
    if (observedSlots.size !== expectedSlots.length || expectedSlots.some((key) => !observedSlots.has(key))) {
      fail(`${indexKey} index is not bijective with its executed planned launches`);
    }
  }
}

function validateQualificationLedgerEntry(entry, capture) {
  const policy = BASELINE_POLICY.performanceQualificationCapturePolicy;
  exact(entry, policy.qualificationLedgerFields, 'qualification ledger entry');
  if (entry.operationId !== 'electron-harness-spawn' || entry.purpose !== 'qualification-probe'
    || entry.outcome !== 'completed' || entry.buildVariant !== 'harness-control'
    || entry.sequence !== capture.ledgerSequence || entry.experimentId !== capture.experimentId
    || entry.policyHash !== capture.policyHash || entry.observationBoundaryId !== capture.observationBoundaryId) {
    fail('qualification ledger entry constants do not match its capture');
  }
  finite(entry.start, 'qualification ledger entry.start');
  finite(entry.end, 'qualification ledger entry.end', entry.start);
  for (const field of ['operationMarker', 'launchId', 'executionId', 'externalExecutionId']) text(entry[field], `qualification ledger entry.${field}`);
  exact(entry.executionIdentity, policy.executionIdentityFields, 'qualification ledger entry.executionIdentity');
  if (entry.executionIdentity.externalExecutionId !== entry.externalExecutionId
    || entry.executionIdentity.executionId !== entry.executionId) fail('qualification ledger executionIdentity is inconsistent');
  exact(entry.markerIdentity, policy.markerIdentityFields, 'qualification ledger entry.markerIdentity');
  if (entry.operationMarker !== entry.launchId || entry.markerIdentity.operationMarker !== entry.operationMarker
    || entry.markerIdentity.launchId !== entry.launchId || entry.markerIdentity.preloadEchoLaunchId !== entry.launchId
    || entry.markerIdentity.rendererEchoLaunchId !== entry.launchId) fail('qualification ledger markerIdentity is inconsistent');
  exact(entry.transportIdentity, policy.transportIdentityFields, 'qualification ledger entry.transportIdentity');
  text(entry.transportIdentity.transportId, 'qualification ledger entry.transportIdentity.transportId');
  if (entry.transportIdentity.observationBoundaryId !== entry.observationBoundaryId) fail('qualification ledger transportIdentity is inconsistent');
  exact(entry.capabilityEvidence, policy.capabilityEvidenceFields, 'qualification ledger entry.capabilityEvidence');
  if (entry.capabilityEvidence.captureBodyChecksum !== capture.captureBodyChecksum) fail('qualification ledger capabilityEvidence changes the capture body checksum');
  exact(entry.ownership, policy.ownershipFields, 'qualification ledger entry.ownership');
  if (entry.ownership.class !== 'application-owned') fail('qualification ledger ownership is invalid');
  if (stableStringify(entry.readinessEvidence) !== stableStringify(capture.captureBody.readinessEvidence)
    || stableStringify(entry.cleanup) !== stableStringify(capture.captureBody.cleanup)) {
    fail('qualification ledger readiness or cleanup is not byte-equal to its capture body');
  }
  if (entry.applicationDescendantClosureEnd !== entry.cleanup.applicationDescendantClosureEnd
    || entry.end !== entry.applicationDescendantClosureEnd) fail('qualification ledger terminal timestamp is inconsistent');
}

function validateLedgerCaptureTopology({ performanceLedger, buildCommandLedger, transportCaptures, qualificationEvidence, backendFamilies }) {
  if (performanceLedger.length === 0) return;
  const bySequence = new Map(performanceLedger.map((entry) => [entry.sequence, entry]));
  const firstMetricIndex = performanceLedger.findIndex((entry) => entry.operationId === 'metric-adapter-session-open');
  if (firstMetricIndex < 0) fail('performance ledger contains no metric-session transaction');
  const prefix = performanceLedger.slice(0, firstMetricIndex);
  const expectedPrefixOperations = [
    'generic-transport-spawn',
    'build-spawn',
    'build-spawn',
    'build-spawn',
    'electron-harness-spawn',
    ...(qualificationEvidence ? ['electron-harness-spawn'] : [])
  ];
  if (stableStringify(prefix.map((entry) => entry.operationId)) !== stableStringify(expectedPrefixOperations)) {
    fail('performance ledger pre-loop operations must be generic transport, all builds, Electron transport, and optional qualification');
  }
  const buildEntries = prefix.filter((entry) => entry.operationId === 'build-spawn');
  if (stableStringify(buildEntries.map((entry) => entry.buildId))
    !== stableStringify(buildCommandLedger.entries.map((entry) => entry.buildId))) {
    fail('performance ledger build prefix does not match the build command ledger');
  }
  for (const [index, capture] of transportCaptures.entries()) {
    const entry = bySequence.get(capture.ledgerSequence);
    if (!entry || entry.operationId !== capture.operationId || entry.operationId !== expectedPrefixOperations[index === 0 ? 0 : 4]) {
      fail('transport capture does not bind its exact pre-loop ledger operation');
    }
  }
  if (qualificationEvidence) {
    const capture = qualificationEvidence.capture;
    const entry = bySequence.get(capture.ledgerSequence);
    if (!entry) fail('qualification capture does not bind its qualification ledger operation');
    validateQualificationLedgerEntry(entry, capture);
  }

  const externalJoins = new Map();
  const specializedJoins = new Map();
  const launchOrdinals = [];
  for (const family of Object.values(backendFamilies)) {
    for (const capture of family.captures.metricSession) {
      const entry = bySequence.get(capture.join.metricSessionOpenSequence);
      if (!entry || entry.operationId !== 'metric-adapter-session-open'
        || entry.metricSessionId !== capture.join.metricSessionId || entry.outcome !== 'ready') {
        fail('metric-session capture does not bind its ready ledger open');
      }
    }
    for (const capture of family.captures.externalMetric) {
      const entry = bySequence.get(capture.join.ledgerSequence);
      const expectedOperation = capture.join.buildVariant === 'production' ? 'production-sentinel-spawn' : 'electron-harness-spawn';
      validatePerformanceManifestRunJoin(capture.join, entry);
      if (entry.operationId !== expectedOperation || entry.outcome !== 'completed') fail('external-metric capture does not bind one completed ledger launch');
      if (externalJoins.has(capture.join.runId)) fail('external-metric captures duplicate a ledger run');
      externalJoins.set(capture.join.runId, capture.join);
      launchOrdinals.push(capture.join.ordinal);
    }
    for (const captureKind of ['sentinel', 'workload']) {
      for (const capture of family.captures[captureKind]) {
        const external = externalJoins.get(capture.join.runId);
        if (!external || stableStringify(external) !== stableStringify(capture.join)) {
          fail(`${captureKind} capture does not bind the exact external-metric run join`);
        }
        if (specializedJoins.has(capture.join.runId)) fail('ledger run has duplicate specialized workload evidence');
        specializedJoins.set(capture.join.runId, captureKind);
      }
    }
  }
  requireContiguous(launchOrdinals.map((ordinal) => ({ ordinal })), 'ordinal', 'external-metric launch ordinals');
  const ledgerLaunches = performanceLedger.slice(firstMetricIndex).filter((entry) => (
    entry.operationId === 'production-sentinel-spawn' || entry.operationId === 'electron-harness-spawn'
  ));
  if (externalJoins.size !== ledgerLaunches.length || ledgerLaunches.some((entry) => !externalJoins.has(entry.runId))) {
    fail('external-metric captures are not bijective with completed ledger launches');
  }
  for (const [runId, join] of externalJoins) {
    const expectedCaptureKind = join.comparisonKind === 'harness-overhead' ? 'sentinel' : 'workload';
    if (specializedJoins.get(runId) !== expectedCaptureKind) fail('ledger run has the wrong specialized capture family');
  }
}

export async function readPerformanceRawCaptureManifest({ outputDirectory } = {}) {
  text(outputDirectory, 'raw capture manifest outputDirectory');
  const root = path.resolve(outputDirectory);
  const manifestPath = path.join(root, PERFORMANCE_RAW_CAPTURE_MANIFEST_FILE);
  let parsed;
  let rootReal;
  let manifestStat;
  try {
    const rootStat = await fs.lstat(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('raw capture output directory must resolve directly to a directory');
    rootReal = await fs.realpath(root);
    manifestStat = await fs.lstat(manifestPath);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) fail('raw capture manifest must resolve directly to a regular file');
    const manifestReal = await fs.realpath(manifestPath);
    const manifestRelative = path.relative(rootReal, manifestReal);
    if (manifestRelative.startsWith('..') || path.isAbsolute(manifestRelative)) fail('raw capture manifest resolves outside the output directory');
    parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    fail(`raw capture manifest is not readable JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = validatePerformanceRawCaptureManifest(parsed);
  const context = manifest.evaluationContext;
  const state = createReadState(root, rootReal, `${manifestStat.dev}:${manifestStat.ino}`);
  const members = manifest.memberReferences;
  const buildManifest = validateBuildManifest(await readReference(state, members.buildManifest, 'build manifest'), context);
  const productionBundleEvidence = validateProductionBundleEvidence(
    await readReference(state, members.productionBundleEvidence, 'production bundle evidence'),
    context,
    buildManifest
  );
  const buildCommandLedger = validateBuildCommandLedger(await readReference(state, members.buildCommandLedger, 'build command ledger'), context);
  const performanceLedger = validateReferencedPerformanceLedger(
    await readReference(state, members.performanceLedger, 'performance ledger'),
    manifest
  );
  const experimentIndexes = {
    environment: validatePerformanceCaptureIndex(
      await readReference(state, members.experimentEvidence.indexes.environment, 'experiment environment index'),
      context
    ),
    transport: validatePerformanceCaptureIndex(
      await readReference(state, members.experimentEvidence.indexes.transport, 'transport index'),
      context
    )
  };
  if (experimentIndexes.environment.captureKind !== 'experiment-environment' || experimentIndexes.environment.entryCount !== 1) {
    fail('experiment environment index must contain exactly one entry');
  }
  if (experimentIndexes.transport.captureKind !== 'transport' || experimentIndexes.transport.entryCount !== 2) {
    fail('transport index must contain exactly two entries');
  }
  const environmentCapture = validateCapture(
    await readReference(state, referenceForEntry(experimentIndexes.environment.entries[0]), 'experiment environment capture'),
    'experiment-environment',
    context
  );
  const transportCaptures = [];
  for (const [index, entry] of experimentIndexes.transport.entries.entries()) {
    const capture = validateCapture(await readReference(state, referenceForEntry(entry), `transport capture ${index}`), 'transport', context);
    assertCaptureEntry(capture, entry, 'transport');
    transportCaptures.push(capture);
  }
  let qualificationEvidence;
  if (members.qualificationEvidence === null) {
    qualificationEvidence = undefined;
  } else {
    const index = validatePerformanceCaptureIndex(
      await readReference(state, members.qualificationEvidence.index, 'qualification index'),
      context
    );
    if (index.captureKind !== 'qualification' || index.entryCount !== 1) fail('qualification index must contain exactly one entry');
    const capture = validateCapture(await readReference(state, referenceForEntry(index.entries[0]), 'qualification capture'), 'qualification', context);
    assertCaptureEntry(capture, index.entries[0], 'qualification');
    qualificationEvidence = freeze({ index, capture });
  }
  const backendFamilies = {};
  const pairPlans = [];
  for (const familyReference of members.backendFamilies) {
    const pairPlan = validatePerformancePairPlan(await readReference(state, familyReference.pairPlan, `${familyReference.backend} pair plan`));
    if (pairPlan.experimentId !== context.experimentId || pairPlan.backend !== familyReference.backend
      || pairPlan.checksum !== familyReference.pairPlan.checksum) fail('pair plan does not match its manifest family');
    pairPlans.push(pairPlan);
    const indexes = {};
    const captures = {};
    for (const key of BACKEND_INDEX_KEYS) {
      const captureKind = Object.entries(PERFORMANCE_CAPTURE_KIND_REGISTRY).find(([, spec]) => spec.indexKey === key)?.[0];
      const index = validatePerformanceCaptureIndex(
        await readReference(state, familyReference.indexes[key], `${familyReference.backend} ${key} index`),
        { ...context, backend: familyReference.backend, pairPlanChecksum: pairPlan.checksum }
      );
      if (index.captureKind !== captureKind) fail(`${familyReference.backend} ${key} index has the wrong capture kind`);
      indexes[key] = index;
      captures[key] = [];
      for (const [entryIndex, entry] of index.entries.entries()) {
        const capture = validateCapture(
          await readReference(state, referenceForEntry(entry), `${familyReference.backend} ${key} capture ${entryIndex}`),
          captureKind,
          context
        );
        if (captureKind === 'metric-session') {
          for (const group of capture.rawKinds) {
            for (const row of group.rows) {
              if (row.pairPlanChecksum !== pairPlan.checksum || row.experimentRole !== context.experimentRole) {
                fail('metric-session raw binding does not match its manifest family');
              }
            }
          }
        } else if (capture.join.pairPlanChecksum !== pairPlan.checksum
          || capture.join.experimentRole !== context.experimentRole
          || capture.join.backend !== familyReference.backend) {
          fail(`${captureKind} run join does not match its manifest family`);
        }
        assertCaptureEntry(capture, entry, captureKind, index, context);
        captures[key].push(capture);
      }
    }
    const family = freeze({ pairPlan, indexes, captures });
    validateExecutedTopology(family);
    backendFamilies[familyReference.backend] = family;
  }
  if (manifest.pairPlansChecksum !== canonicalSha256(pairPlans)) fail('manifest pairPlansChecksum does not match the resolved backend plans');
  validateLedgerCaptureTopology({
    performanceLedger,
    buildCommandLedger,
    transportCaptures,
    qualificationEvidence,
    backendFamilies
  });
  return freeze({
    manifest,
    buildManifest,
    productionBundleEvidence,
    buildCommandLedger,
    performanceLedger,
    ...(qualificationEvidence ? { qualificationEvidence } : {}),
    experimentEvidence: {
      indexes: experimentIndexes,
      captures: { environment: environmentCapture, transport: transportCaptures }
    },
    backendFamilies
  });
}
