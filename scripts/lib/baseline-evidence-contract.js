import { canonicalSha256, stableStringify, validateCaptureProvenance } from './baseline-report.js';

const SHA256 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40,64}$/;
const ROOT_REFERENCE_KINDS = new Set([
  'singleton-report',
  'package-report',
  'ci-experiment-parent',
  'reference-experiment-parent',
  'no-host-blocker',
  'decision-evidence'
]);

function fail(message) {
  throw new TypeError(`Baseline evidence contract failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertKnownKeys(value, required, optional, label) {
  assertObject(value, label);
  const known = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!known.has(key)) fail(`${label} has unknown key ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
}

function assertString(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || value.length === 0) fail(`${label} must be a nonempty string`);
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(`${label} must be a lowercase SHA-256 digest`);
}

function assertGitSha(value, label) {
  if (typeof value !== 'string' || !GIT_SHA.test(value)) fail(`${label} must be a lowercase Git SHA`);
}

function assertSafeInteger(value, label, { minimum = 0 } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function cloneCanonical(value) {
  return JSON.parse(stableStringify(value));
}

function referenceKey(reference) {
  return `${reference.kind}:${reference.hash}`;
}

export function normalizeTypedReferences(references, label = 'rootReferences') {
  if (!Array.isArray(references) || references.length === 0) fail(`${label} must be a nonempty array`);
  const normalized = references.map((reference, index) => {
    assertKnownKeys(reference, ['kind', 'hash'], [], `${label}[${index}]`);
    assertString(reference.kind, `${label}[${index}].kind`);
    if (!ROOT_REFERENCE_KINDS.has(reference.kind)) fail(`${label}[${index}].kind is not a permitted root kind`);
    assertSha(reference.hash, `${label}[${index}].hash`);
    return { kind: reference.kind, hash: reference.hash };
  });
  const keys = normalized.map(referenceKey);
  if (new Set(keys).size !== keys.length) fail(`${label} must not contain duplicate typed references`);
  if (keys.join('\u0000') !== [...keys].sort().join('\u0000')) fail(`${label} must be sorted by kind and hash`);
  return normalized;
}

function countReferences(references, kind) {
  return references.filter((reference) => reference.kind === kind).length;
}

function referenceSet(references) {
  return new Set(references.map(referenceKey));
}

function assertExactReferenceExtension(references, baseReferences, extensionKind, label) {
  const base = referenceSet(baseReferences);
  const actual = referenceSet(references);
  for (const key of base) {
    if (!actual.has(key)) fail(`${label} must retain every nested root reference`);
  }
  const extensions = references.filter((reference) => !base.has(referenceKey(reference)));
  if (extensions.length !== 1 || extensions[0].kind !== extensionKind) {
    fail(`${label} must add exactly one ${extensionKind} root and no unrelated root`);
  }
}

/**
 * The contract intentionally does not copy the platform target manifest. It proves the
 * core shape (four singleton reports, at least one package report, and exactly one CI
 * experiment); the merger later resolves package identities against that manifest.
 */
export function validateRootProjection(references, mode, { coreReferences = undefined, resolvedReferences = undefined } = {}) {
  const normalized = normalizeTypedReferences(references, `${mode}.rootReferences`);
  const counts = Object.fromEntries([...ROOT_REFERENCE_KINDS].map((kind) => [kind, countReferences(normalized, kind)]));
  const validateCoreShape = () => {
    if (counts['singleton-report'] !== 4) fail(`${mode} requires exactly four singleton report roots`);
    if (counts['package-report'] < 1) fail(`${mode} requires at least one package report root`);
    if (counts['ci-experiment-parent'] !== 1) fail(`${mode} requires exactly one CI experiment parent root`);
  };
  if (mode === 'core') {
    validateCoreShape();
    if (counts['reference-experiment-parent'] || counts['no-host-blocker'] || counts['decision-evidence']) {
      fail('core root projection cannot include reference, no-host, or decision evidence');
    }
    return normalized;
  }
  if (!Array.isArray(coreReferences)) fail(`${mode} requires the nested core root projection`);
  const normalizedCore = validateRootProjection(coreReferences, 'core');
  if (mode === 'selected-reference') {
    validateCoreShape();
    if (counts['reference-experiment-parent'] !== 1 || counts['no-host-blocker'] || counts['decision-evidence']) {
      fail('selected-reference root projection requires one reference parent and no no-host/decision root');
    }
    assertExactReferenceExtension(normalized, normalizedCore, 'reference-experiment-parent', mode);
    return normalized;
  }
  if (mode === 'no-reference-host') {
    validateCoreShape();
    if (counts['reference-experiment-parent'] || counts['no-host-blocker'] !== 1 || counts['decision-evidence']) {
      fail('no-reference-host root projection requires one no-host blocker and no reference/decision root');
    }
    assertExactReferenceExtension(normalized, normalizedCore, 'no-host-blocker', mode);
    return normalized;
  }
  if (mode === 'accepted-selected-reference') {
    validateCoreShape();
    if (counts['reference-experiment-parent'] !== 1 || counts['no-host-blocker'] || counts['decision-evidence'] !== 1) {
      fail('accepted selected-reference projection requires reference and one decision root only');
    }
    if (!Array.isArray(resolvedReferences)) fail('accepted selected-reference projection requires the nested resolved root projection');
    const normalizedResolved = validateRootProjection(resolvedReferences, 'selected-reference', { coreReferences: normalizedCore });
    assertExactReferenceExtension(normalized, normalizedResolved, 'decision-evidence', mode);
    return normalized;
  }
  if (mode === 'accepted-no-reference-host') {
    validateCoreShape();
    if (counts['reference-experiment-parent'] || counts['no-host-blocker'] !== 1 || counts['decision-evidence'] !== 1) {
      fail('accepted no-reference-host projection requires no-host and one decision root only');
    }
    if (!Array.isArray(resolvedReferences)) fail('accepted no-reference-host projection requires the nested resolved root projection');
    const normalizedResolved = validateRootProjection(resolvedReferences, 'no-reference-host', { coreReferences: normalizedCore });
    assertExactReferenceExtension(normalized, normalizedResolved, 'decision-evidence', mode);
    return normalized;
  }
  fail(`unknown root projection mode ${mode}`);
}

export function validatePolicyHashes(policyHashes) {
  assertObject(policyHashes, 'policyHashes');
  const keys = Object.keys(policyHashes).sort();
  if (keys.length === 0) fail('policyHashes must not be empty');
  for (const key of keys) {
    assertString(key, 'policyHashes key');
    assertSha(policyHashes[key], `policyHashes.${key}`);
  }
  return Object.fromEntries(keys.map((key) => [key, policyHashes[key]]));
}

export function validateDedupStatistics(statistics) {
  assertKnownKeys(statistics, [
    'logicalReferenceCount',
    'uniqueObjectCount',
    'logicalCanonicalBodyBytes',
    'uniqueCanonicalBodyBytes',
    'savedObjectOccurrences',
    'savedCanonicalBodyBytes'
  ], [], 'dedupStatistics');
  for (const [key, value] of Object.entries(statistics)) assertSafeInteger(value, `dedupStatistics.${key}`);
  if (statistics.savedObjectOccurrences !== statistics.logicalReferenceCount - statistics.uniqueObjectCount) {
    fail('dedupStatistics.savedObjectOccurrences is inconsistent');
  }
  if (statistics.savedCanonicalBodyBytes !== statistics.logicalCanonicalBodyBytes - statistics.uniqueCanonicalBodyBytes) {
    fail('dedupStatistics.savedCanonicalBodyBytes is inconsistent');
  }
  if (statistics.savedObjectOccurrences < 0 || statistics.savedCanonicalBodyBytes < 0) {
    fail('dedupStatistics savings must not be negative');
  }
  return { ...statistics };
}

function validateArchiveProjection(value, label) {
  const required = ['canonicalArchiveSha256', 'objectIndexSha256', 'expandedJsonlBytes', 'objectCount', 'recordCount', 'dedupStatistics'];
  assertObject(value, label);
  for (const key of required) if (!(key in value)) fail(`${label} is missing key ${key}`);
  assertSha(value.canonicalArchiveSha256, `${label}.canonicalArchiveSha256`);
  assertSha(value.objectIndexSha256, `${label}.objectIndexSha256`);
  assertSafeInteger(value.expandedJsonlBytes, `${label}.expandedJsonlBytes`);
  assertSafeInteger(value.objectCount, `${label}.objectCount`);
  assertSafeInteger(value.recordCount, `${label}.recordCount`, { minimum: 1 });
  if (value.recordCount !== value.objectCount + 1) fail(`${label}.recordCount must equal objectCount + 1`);
  return {
    canonicalArchiveSha256: value.canonicalArchiveSha256,
    objectIndexSha256: value.objectIndexSha256,
    expandedJsonlBytes: value.expandedJsonlBytes,
    objectCount: value.objectCount,
    recordCount: value.recordCount,
    dedupStatistics: validateDedupStatistics(value.dedupStatistics)
  };
}

function validateWorkflowProvenance(workflowProvenance) {
  assertKnownKeys(workflowProvenance, ['captureIdentity', 'producers'], [], 'workflowProvenance');
  const captureIdentity = validateCaptureProvenance({
    ...workflowProvenance.captureIdentity,
    producer: {
      jobId: 'core-projection',
      targetId: null,
      artifactName: 'core-projection'
    }
  });
  if (captureIdentity.provider !== 'github-actions') fail('workflowProvenance.captureIdentity must be a GitHub Actions identity');
  const { producer: ignoredProducer, ...identity } = captureIdentity;
  if (!Array.isArray(workflowProvenance.producers) || workflowProvenance.producers.length === 0) {
    fail('workflowProvenance.producers must be a nonempty array');
  }
  const producers = workflowProvenance.producers.map((producer, index) => {
    assertKnownKeys(producer, ['jobId', 'targetId', 'artifactName'], [], `workflowProvenance.producers[${index}]`);
    assertString(producer.jobId, `workflowProvenance.producers[${index}].jobId`);
    assertString(producer.targetId, `workflowProvenance.producers[${index}].targetId`, { nullable: true });
    assertString(producer.artifactName, `workflowProvenance.producers[${index}].artifactName`);
    return { ...producer };
  });
  const keys = producers.map((producer) => `${producer.jobId}\u0000${producer.targetId ?? ''}\u0000${producer.artifactName}`);
  if (new Set(keys).size !== keys.length || keys.join('\u0001') !== [...keys].sort().join('\u0001')) {
    fail('workflowProvenance.producers must be sorted and unique');
  }
  return { captureIdentity: identity, producers };
}

function validateSourceIdentity(value, label) {
  assertObject(value, label);
  for (const key of ['schemaVersion', 'status', 'programOriginSha', 'analysisSha256', 'sourceSha', 'policyHashes']) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
  if (value.schemaVersion !== 1) fail(`${label}.schemaVersion must be 1`);
  if (value.status !== 'complete') fail(`${label}.status must be complete`);
  assertGitSha(value.programOriginSha, `${label}.programOriginSha`);
  assertSha(value.analysisSha256, `${label}.analysisSha256`);
  assertGitSha(value.sourceSha, `${label}.sourceSha`);
  return {
    schemaVersion: value.schemaVersion,
    status: value.status,
    programOriginSha: value.programOriginSha,
    analysisSha256: value.analysisSha256,
    sourceSha: value.sourceSha,
    policyHashes: validatePolicyHashes(value.policyHashes)
  };
}

const CORE_REQUIRED = [
  'schemaVersion', 'status', 'programOriginSha', 'analysisSha256', 'sourceSha', 'policyHashes', 'rootReferences',
  'canonicalArchiveSha256', 'objectIndexSha256', 'expandedJsonlBytes', 'objectCount', 'recordCount', 'dedupStatistics', 'workflowProvenance'
];
const CORE_OPTIONAL = ['sourceViews', 'productionBundleEvidence', 'limits'];

export function createCoreEvidenceBody(input) {
  assertKnownKeys(input, CORE_REQUIRED, CORE_OPTIONAL, 'coreEvidenceBody');
  const identity = validateSourceIdentity(input, 'coreEvidenceBody');
  const archive = validateArchiveProjection(input, 'coreEvidenceBody');
  const result = {
    ...identity,
    rootReferences: validateRootProjection(input.rootReferences, 'core'),
    ...archive,
    workflowProvenance: validateWorkflowProvenance(input.workflowProvenance)
  };
  for (const key of CORE_OPTIONAL) {
    if (key in input) result[key] = cloneCanonical(input[key]);
  }
  return result;
}

export function checksumCoreEvidenceBody(body) {
  return canonicalSha256(createCoreEvidenceBody(body));
}

export function createCoreEvidenceRecord(input) {
  assertKnownKeys(input, ['coreEvidenceBody'], ['coreEvidenceChecksum'], 'coreEvidenceRecord');
  const coreEvidenceBody = createCoreEvidenceBody(input.coreEvidenceBody);
  const coreEvidenceChecksum = checksumCoreEvidenceBody(coreEvidenceBody);
  if (input.coreEvidenceChecksum !== undefined && input.coreEvidenceChecksum !== coreEvidenceChecksum) {
    fail('coreEvidenceChecksum does not match coreEvidenceBody');
  }
  return { coreEvidenceBody, coreEvidenceChecksum };
}

function validateCompressorIdentity(identity) {
  assertKnownKeys(identity, [
    'codec', 'nodeVersion', 'zlibVersion', 'level', 'strategy', 'windowBits', 'memLevel', 'inputChunkBytes',
    'intermediateFlush', 'finishFlush', 'mtime', 'filename', 'comment', 'osByte', 'compressorProbePolicyHash', 'compressorProbeSha256'
  ], [], 'compressorIdentity');
  if (identity.codec !== 'node:zlib.gzip') fail('compressorIdentity.codec must be node:zlib.gzip');
  assertString(identity.nodeVersion, 'compressorIdentity.nodeVersion');
  assertString(identity.zlibVersion, 'compressorIdentity.zlibVersion');
  if (identity.level !== 9 || identity.strategy !== 'Z_DEFAULT_STRATEGY' || identity.windowBits !== 15 || identity.memLevel !== 8 || identity.inputChunkBytes !== 65536) {
    fail('compressorIdentity does not use the closed v1 settings');
  }
  if (identity.intermediateFlush !== 'Z_NO_FLUSH' || identity.finishFlush !== 'Z_FINISH' || identity.mtime !== 0 || identity.filename !== null || identity.comment !== null || identity.osByte !== 255) {
    fail('compressorIdentity does not use the closed v1 framing/header settings');
  }
  assertSha(identity.compressorProbePolicyHash, 'compressorIdentity.compressorProbePolicyHash');
  assertSha(identity.compressorProbeSha256, 'compressorIdentity.compressorProbeSha256');
  return { ...identity };
}

export function createCoreCandidateBody(input) {
  assertKnownKeys(input, ['coreEvidenceBody', 'coreEvidenceChecksum', 'compressedArchiveSha256', 'compressedBytes', 'compressorIdentity'], ['coreCandidateChecksum'], 'coreCandidateBody');
  const core = createCoreEvidenceRecord({ coreEvidenceBody: input.coreEvidenceBody, coreEvidenceChecksum: input.coreEvidenceChecksum });
  assertSha(input.compressedArchiveSha256, 'coreCandidateBody.compressedArchiveSha256');
  assertSafeInteger(input.compressedBytes, 'coreCandidateBody.compressedBytes');
  const result = {
    ...core,
    compressedArchiveSha256: input.compressedArchiveSha256,
    compressedBytes: input.compressedBytes,
    compressorIdentity: validateCompressorIdentity(input.compressorIdentity)
  };
  const coreCandidateChecksum = canonicalSha256(result);
  if (input.coreCandidateChecksum !== undefined && input.coreCandidateChecksum !== coreCandidateChecksum) {
    fail('coreCandidateChecksum does not match coreCandidateBody');
  }
  return { ...result, coreCandidateChecksum };
}

const RESOLVED_REQUIRED = [
  'coreEvidenceBody', 'coreEvidenceChecksum', 'resolutionMode', 'status', 'rootReferences',
  'canonicalArchiveSha256', 'objectIndexSha256', 'expandedJsonlBytes', 'objectCount', 'recordCount', 'dedupStatistics', 'resolution'
];

export function createResolvedEvidenceBody(input) {
  assertKnownKeys(input, RESOLVED_REQUIRED, [], 'resolvedEvidenceBody');
  const core = createCoreEvidenceRecord({ coreEvidenceBody: input.coreEvidenceBody, coreEvidenceChecksum: input.coreEvidenceChecksum });
  if (!['selected-reference', 'no-reference-host'].includes(input.resolutionMode)) fail('resolvedEvidenceBody.resolutionMode is invalid');
  if (input.status !== 'complete') fail('resolvedEvidenceBody.status must be complete');
  const resolution = cloneCanonical(input.resolution);
  assertObject(resolution, 'resolvedEvidenceBody.resolution');
  if (input.resolutionMode === 'no-reference-host' && resolution.mode !== 'no-host-selected') fail('no-reference-host resolution must use no-host-selected');
  if (input.resolutionMode === 'selected-reference' && resolution.mode !== 'selected-reference') fail('selected-reference resolution must use selected-reference');
  const rootMode = input.resolutionMode === 'selected-reference' ? 'selected-reference' : 'no-reference-host';
  return {
    ...core,
    resolutionMode: input.resolutionMode,
    status: input.status,
    rootReferences: validateRootProjection(input.rootReferences, rootMode, { coreReferences: core.coreEvidenceBody.rootReferences }),
    ...validateArchiveProjection(input, 'resolvedEvidenceBody'),
    resolution
  };
}

export function checksumResolvedEvidenceBody(body) {
  return canonicalSha256(createResolvedEvidenceBody(body));
}

export function createResolvedEvidenceRecord(input) {
  assertKnownKeys(input, ['resolvedEvidenceBody'], ['resolvedEvidenceChecksum'], 'resolvedEvidenceRecord');
  const resolvedEvidenceBody = createResolvedEvidenceBody(input.resolvedEvidenceBody);
  const resolvedEvidenceChecksum = checksumResolvedEvidenceBody(resolvedEvidenceBody);
  if (input.resolvedEvidenceChecksum !== undefined && input.resolvedEvidenceChecksum !== resolvedEvidenceChecksum) {
    fail('resolvedEvidenceChecksum does not match resolvedEvidenceBody');
  }
  return { resolvedEvidenceBody, resolvedEvidenceChecksum };
}

export function createResolvedCandidateBody(input) {
  assertKnownKeys(input, [
    'resolvedEvidenceBody', 'resolvedEvidenceChecksum', 'coreCandidateChecksum', 'compressedArchiveSha256', 'compressedBytes', 'compressorIdentity'
  ], ['resolvedCandidateChecksum'], 'resolvedCandidateBody');
  const resolved = createResolvedEvidenceRecord({
    resolvedEvidenceBody: input.resolvedEvidenceBody,
    resolvedEvidenceChecksum: input.resolvedEvidenceChecksum
  });
  assertSha(input.coreCandidateChecksum, 'resolvedCandidateBody.coreCandidateChecksum');
  assertSha(input.compressedArchiveSha256, 'resolvedCandidateBody.compressedArchiveSha256');
  assertSafeInteger(input.compressedBytes, 'resolvedCandidateBody.compressedBytes');
  const result = {
    ...resolved,
    coreCandidateChecksum: input.coreCandidateChecksum,
    compressedArchiveSha256: input.compressedArchiveSha256,
    compressedBytes: input.compressedBytes,
    compressorIdentity: validateCompressorIdentity(input.compressorIdentity)
  };
  const resolvedCandidateChecksum = canonicalSha256(result);
  if (input.resolvedCandidateChecksum !== undefined && input.resolvedCandidateChecksum !== resolvedCandidateChecksum) {
    fail('resolvedCandidateChecksum does not match resolvedCandidateBody');
  }
  return { ...result, resolvedCandidateChecksum };
}

export function createAcceptedEvidenceBody(input) {
  assertKnownKeys(input, ['resolvedEvidenceBody', 'resolvedEvidenceChecksum', 'decision', 'decisionChecksum', 'rootReferences'], ['acceptedEvidenceChecksum'], 'acceptedEvidenceBody');
  const resolved = createResolvedEvidenceRecord({
    resolvedEvidenceBody: input.resolvedEvidenceBody,
    resolvedEvidenceChecksum: input.resolvedEvidenceChecksum
  });
  assertObject(input.decision, 'acceptedEvidenceBody.decision');
  assertSha(input.decisionChecksum, 'acceptedEvidenceBody.decisionChecksum');
  if (canonicalSha256(input.decision) !== input.decisionChecksum) fail('decisionChecksum does not match decision');
  const rootMode = resolved.resolvedEvidenceBody.resolutionMode === 'selected-reference'
    ? 'accepted-selected-reference'
    : 'accepted-no-reference-host';
  const rootReferences = validateRootProjection(input.rootReferences, rootMode, {
    coreReferences: resolved.resolvedEvidenceBody.coreEvidenceBody.rootReferences,
    resolvedReferences: resolved.resolvedEvidenceBody.rootReferences
  });
  const result = {
    ...resolved,
    decision: cloneCanonical(input.decision),
    decisionChecksum: input.decisionChecksum,
    rootReferences
  };
  const acceptedEvidenceChecksum = canonicalSha256(result);
  if (input.acceptedEvidenceChecksum !== undefined && input.acceptedEvidenceChecksum !== acceptedEvidenceChecksum) {
    fail('acceptedEvidenceChecksum does not match acceptedEvidenceBody');
  }
  return { ...result, acceptedEvidenceChecksum };
}

export function createAcceptedRootBody(input) {
  assertKnownKeys(input, [
    'acceptedEvidenceBody', 'acceptedEvidenceChecksum', 'compressedArchiveSha256', 'compressedBytes', 'compressorIdentity'
  ], ['acceptedRootChecksum'], 'acceptedRootBody');
  const accepted = createAcceptedEvidenceBody({
    ...input.acceptedEvidenceBody,
    acceptedEvidenceChecksum: input.acceptedEvidenceChecksum
  });
  assertSha(input.compressedArchiveSha256, 'acceptedRootBody.compressedArchiveSha256');
  assertSafeInteger(input.compressedBytes, 'acceptedRootBody.compressedBytes');
  const result = {
    acceptedEvidenceBody: (() => {
      const { acceptedEvidenceChecksum: ignored, ...body } = accepted;
      return body;
    })(),
    acceptedEvidenceChecksum: accepted.acceptedEvidenceChecksum,
    compressedArchiveSha256: input.compressedArchiveSha256,
    compressedBytes: input.compressedBytes,
    compressorIdentity: validateCompressorIdentity(input.compressorIdentity)
  };
  const acceptedRootChecksum = canonicalSha256(result);
  if (input.acceptedRootChecksum !== undefined && input.acceptedRootChecksum !== acceptedRootChecksum) {
    fail('acceptedRootChecksum does not match acceptedRootBody');
  }
  return { ...result, acceptedRootChecksum };
}

export const validateCoreEvidenceBody = createCoreEvidenceBody;
export const validateCoreCandidateBody = createCoreCandidateBody;
export const validateResolvedEvidenceBody = createResolvedEvidenceBody;
export const validateResolvedCandidateBody = createResolvedCandidateBody;
export const validateAcceptedEvidenceBody = createAcceptedEvidenceBody;
export const validateAcceptedRootBody = createAcceptedRootBody;

export const coreEvidenceBody = createCoreEvidenceBody;
export const coreCandidateBody = createCoreCandidateBody;
export const resolvedEvidenceBody = createResolvedEvidenceBody;
export const resolvedCandidateBody = createResolvedCandidateBody;
export const acceptedEvidenceBody = createAcceptedEvidenceBody;
export const acceptedRootBody = createAcceptedRootBody;
