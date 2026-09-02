import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import zlib from 'node:zlib';
import { canonicalSha256, stableStringify } from './baseline-report.js';
import {
  assertCompressorIdentityMatches,
  validateCompressorIdentity,
  validateRootProjection
} from './baseline-evidence-contract.js';

/**
 * @typedef {object} EvidenceLimits
 * @property {number} maxRootBytes
 * @property {number} maxCompressedBytes
 * @property {number} maxExpandedJsonlBytes
 * @property {number} maxRecordBytes
 * @property {number} maxTotalRecords
 * @property {number} maxIndexedObjects
 */

export const EVIDENCE_ARCHIVE_SCHEMA_VERSION = 1;
/** @type {Readonly<EvidenceLimits>} */
export const EVIDENCE_HARD_LIMITS = Object.freeze({
  maxRootBytes: 131072,
  maxCompressedBytes: 16777216,
  maxExpandedJsonlBytes: 134217728,
  maxRecordBytes: 8388608,
  maxTotalRecords: 65536,
  maxIndexedObjects: 65535
});
export const publicationHeadroomPolicy = Object.freeze({ numerator: 4, denominator: 5 });

const ROOT_KINDS = new Set([
  'singleton-report',
  'package-report',
  'ci-experiment-parent',
  'reference-experiment-parent',
  'no-host-blocker',
  'decision-evidence'
]);

const ROOT_PROJECTION_KEYS = Object.freeze({
  core: ['mode', 'rootReferences'],
  'selected-reference': ['mode', 'rootReferences', 'coreReferences'],
  'no-reference-host': ['mode', 'rootReferences', 'coreReferences'],
  'accepted-selected-reference': ['mode', 'rootReferences', 'coreReferences', 'resolvedReferences'],
  'accepted-no-reference-host': ['mode', 'rootReferences', 'coreReferences', 'resolvedReferences']
});

const CANONICAL_GZIP_HEADER = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff]);
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) === 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.freeze(value);
}

export const objectKindReferenceRegistry = deepFreeze({
  'singleton-report': { ownership: 'root-only', outgoing: {} },
  'package-report': { ownership: 'root-only', outgoing: {} },
  'ci-experiment-parent': {
    ownership: 'root-only',
    outgoing: {
      childManifest: { kind: 'experiment-child-manifest', cardinality: 'one' },
      policyReferences: { kind: 'policy-leaf', cardinality: 'many' },
      environmentReferences: { kind: 'environment-leaf', cardinality: 'many' }
    }
  },
  'reference-experiment-parent': {
    ownership: 'root-only',
    outgoing: {
      childManifest: { kind: 'experiment-child-manifest', cardinality: 'one' },
      policyReferences: { kind: 'policy-leaf', cardinality: 'many' },
      environmentReferences: { kind: 'environment-leaf', cardinality: 'many' }
    }
  },
  'no-host-blocker': { ownership: 'root-only', outgoing: {} },
  'decision-evidence': { ownership: 'root-only', outgoing: {} },
  'experiment-child-manifest': {
    ownership: 'unique',
    outgoing: {
      runReferences: { kind: 'run', cardinality: 'many' },
      aggregateReferences: { kind: 'aggregate', cardinality: 'many' },
      comparisonReferences: { kind: 'comparison', cardinality: 'many' },
      qualificationReferences: { kind: 'qualification', cardinality: 'many' },
      rawKindManifestReferences: { kind: 'raw-kind-manifest', cardinality: 'many' }
    }
  },
  run: { ownership: 'unique', outgoing: {} },
  aggregate: { ownership: 'unique', outgoing: {} },
  comparison: { ownership: 'unique', outgoing: {} },
  qualification: { ownership: 'unique', outgoing: {} },
  'raw-kind-manifest': {
    ownership: 'unique',
    outgoing: {
      chunkReferences: { kind: 'raw-chunk', cardinality: 'many' },
      dictionaryReferences: { kind: 'dictionary', cardinality: 'many' }
    }
  },
  'raw-chunk': { ownership: 'unique', outgoing: {} },
  dictionary: { ownership: 'shareable', outgoing: {} },
  'policy-leaf': { ownership: 'shareable', outgoing: {} },
  'environment-leaf': { ownership: 'shareable', outgoing: {} }
});

function fail(message) {
  throw new TypeError(`Baseline evidence store failed: ${message}`);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail(`${label} must be an object`);
}

function assertExactKeys(value, keys, label) {
  assertObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) fail(`${label} has an unknown key ${key}`);
  }
  for (const key of keys) {
    if (!(key in value)) fail(`${label} is missing key ${key}`);
  }
}

function assertSafeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be a safe integer >= ${minimum}`);
}

function assertSha(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(`${label} must be a SHA-256 digest`);
}

function referenceKey(reference) {
  return `${reference.kind}:${reference.hash}`;
}

function normalizeReference(reference, label) {
  assertObject(reference, label);
  if (Object.keys(reference).length !== 2 || !('kind' in reference) || !('hash' in reference)) fail(`${label} must have kind and hash only`);
  if (typeof reference.kind !== 'string' || !objectKindReferenceRegistry[reference.kind]) fail(`${label}.kind is unknown`);
  assertSha(reference.hash, `${label}.hash`);
  return { kind: reference.kind, hash: reference.hash };
}

function normalizeReferences(references, label, expectedKind) {
  if (!Array.isArray(references)) fail(`${label} must be an array`);
  const normalized = references.map((reference, index) => {
    const result = normalizeReference(reference, `${label}[${index}]`);
    if (expectedKind && result.kind !== expectedKind) fail(`${label}[${index}] must have kind ${expectedKind}`);
    return result;
  });
  const keys = normalized.map(referenceKey);
  if (new Set(keys).size !== keys.length) fail(`${label} contains duplicate references`);
  if (keys.join('\u0000') !== [...keys].sort().join('\u0000')) fail(`${label} must be sorted`);
  return normalized;
}

function normalizeRootReferences(rootReferences) {
  const normalized = normalizeReferences(rootReferences, 'rootReferences');
  if (normalized.length === 0) fail('rootReferences must not be empty');
  for (const reference of normalized) {
    if (!ROOT_KINDS.has(reference.kind)) fail(`rootReferences cannot directly include ${reference.kind}`);
  }
  return normalized;
}

function sameReferences(left, right) {
  return stableStringify(left) === stableStringify(right);
}

/**
 * A projection context is deliberately closed. The archive codec must not infer whether
 * roots are a core, selected-reference, no-host, or accepted publication projection.
 */
export function createRootProjectionContext(context) {
  assertObject(context, 'root projection context');
  if (typeof context.mode !== 'string' || !ROOT_PROJECTION_KEYS[context.mode]) {
    fail('root projection context has an unknown mode');
  }
  assertExactKeys(context, ROOT_PROJECTION_KEYS[context.mode], 'root projection context');
  const rootReferences = normalizeRootReferences(context.rootReferences);
  const coreReferences = context.coreReferences === undefined ? undefined : normalizeRootReferences(context.coreReferences);
  const resolvedReferences = context.resolvedReferences === undefined ? undefined : normalizeRootReferences(context.resolvedReferences);
  const validatedRoots = validateRootProjection(rootReferences, context.mode, { coreReferences, resolvedReferences });
  return {
    mode: context.mode,
    rootReferences: validatedRoots,
    ...(coreReferences === undefined ? {} : { coreReferences }),
    ...(resolvedReferences === undefined ? {} : { resolvedReferences })
  };
}

export function validateArchiveRootMode(rootReferences, rootProjection) {
  const context = createRootProjectionContext(rootProjection);
  const roots = normalizeRootReferences(rootReferences);
  if (!sameReferences(roots, context.rootReferences)) {
    fail('archive root references do not match the explicit root projection context');
  }
  return roots;
}

function clone(value) {
  return JSON.parse(stableStringify(value));
}

function objectHash(kind, body) {
  return canonicalSha256({ kind, body });
}

function normalizeStoredObject(entry, label = 'object') {
  assertObject(entry, label);
  if (Object.keys(entry).sort().join(',') !== 'body,canonicalBodyBytes,hash,kind') fail(`${label} has an invalid record shape`);
  if (!objectKindReferenceRegistry[entry.kind]) fail(`${label}.kind is unknown`);
  assertSha(entry.hash, `${label}.hash`);
  assertObject(entry.body, `${label}.body`);
  const canonicalBodyBytes = Buffer.byteLength(stableStringify(entry.body), 'utf8');
  if (entry.canonicalBodyBytes !== canonicalBodyBytes) fail(`${label}.canonicalBodyBytes is invalid`);
  if (entry.hash !== objectHash(entry.kind, entry.body)) fail(`${label}.hash does not bind kind and body`);
  return { hash: entry.hash, kind: entry.kind, body: clone(entry.body), canonicalBodyBytes };
}

function findTypedReferencePaths(value, pathPrefix = '', matches = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findTypedReferencePaths(entry, `${pathPrefix}[${index}]`, matches));
    return matches;
  }
  if (!isPlainObject(value)) return matches;
  if ('kind' in value && 'hash' in value) {
    matches.push(pathPrefix || '<body>');
    return matches;
  }
  for (const [key, entry] of Object.entries(value)) {
    findTypedReferencePaths(entry, pathPrefix ? `${pathPrefix}.${key}` : key, matches);
  }
  return matches;
}

function outgoingReferences(entry) {
  const specification = objectKindReferenceRegistry[entry.kind];
  const references = [];
  const declaredReferencePaths = new Set();
  for (const [field, edge] of Object.entries(specification.outgoing)) {
    const value = entry.body[field];
    if (value === undefined) {
      if (edge.cardinality === 'one') fail(`${entry.kind} ${entry.hash} is missing required edge ${field}`);
      continue;
    }
    if (edge.cardinality === 'one') {
      const reference = normalizeReference(value, `${entry.kind}.${field}`);
      if (reference.kind !== edge.kind) fail(`${entry.kind}.${field} must point to ${edge.kind}`);
      references.push(reference);
      declaredReferencePaths.add(field);
      continue;
    }
    const normalized = normalizeReferences(value, `${entry.kind}.${field}`, edge.kind);
    normalized.forEach((reference, index) => declaredReferencePaths.add(`${field}[${index}]`));
    references.push(...normalized);
  }
  for (const foundPath of findTypedReferencePaths(entry.body)) {
    if (!declaredReferencePaths.has(foundPath)) {
      fail(`${entry.kind} ${entry.hash} has an undeclared typed reference at ${foundPath}`);
    }
  }
  return references;
}

function asObjectMap(objects) {
  if (objects instanceof Map) {
    const normalized = new Map();
    for (const [hash, entry] of objects.entries()) {
      assertSha(hash, 'objects map key');
      const stored = normalizeStoredObject(entry, `objects.${hash}`);
      if (stored.hash !== hash) fail(`objects.${hash} is keyed by the wrong hash`);
      normalized.set(hash, stored);
    }
    return normalized;
  }
  if (Array.isArray(objects)) {
    const normalized = new Map();
    objects.forEach((entry, index) => {
      const stored = normalizeStoredObject(entry, `objects[${index}]`);
      if (normalized.has(stored.hash)) fail(`objects contains duplicate hash ${stored.hash}`);
      normalized.set(stored.hash, stored);
    });
    return normalized;
  }
  if (isPlainObject(objects)) return new Map(Object.entries(objects).map(([hash, entry]) => {
    const normalized = normalizeStoredObject(entry, `objects.${hash}`);
    if (normalized.hash !== hash) fail(`objects.${hash} is keyed by the wrong hash`);
    return [hash, normalized];
  }));
  fail('objects must be a map, array, or object map');
}

function assertObjectMapIntegrity(objectMap) {
  for (const [hash, entry] of objectMap.entries()) {
    assertSha(hash, 'object map key');
    if (!entry || entry.hash !== hash) fail(`objects.${hash} is keyed by the wrong hash`);
  }
}

function computeGraph(objectMap, rootReferences) {
  assertObjectMapIntegrity(objectMap);
  const roots = normalizeRootReferences(rootReferences);
  const incoming = new Map();
  const visited = new Set();
  const visiting = new Set();
  const edgeOccurrences = [];

  const visit = (reference, parentHash = null) => {
    const entry = objectMap.get(reference.hash);
    if (!entry) fail(`missing referenced object ${reference.kind}:${reference.hash}`);
    if (entry.kind !== reference.kind) fail(`reference ${reference.hash} expects ${reference.kind} but resolves to ${entry.kind}`);
    if (parentHash !== null) {
      incoming.set(reference.hash, [...(incoming.get(reference.hash) ?? []), parentHash]);
      edgeOccurrences.push(reference);
    } else {
      incoming.set(reference.hash, [...(incoming.get(reference.hash) ?? []), null]);
      edgeOccurrences.push(reference);
    }
    if (visiting.has(reference.hash)) fail(`evidence object graph contains a cycle at ${reference.hash}`);
    if (visited.has(reference.hash)) return;
    visiting.add(reference.hash);
    for (const childReference of outgoingReferences(entry)) visit(childReference, reference.hash);
    visiting.delete(reference.hash);
    visited.add(reference.hash);
  };

  for (const root of roots) visit(root);
  const closure = [...visited].sort();
  if (closure.length !== objectMap.size) {
    const orphan = [...objectMap.keys()].filter((hash) => !visited.has(hash)).sort()[0];
    fail(`evidence object graph contains an orphan object ${orphan}`);
  }
  for (const hash of closure) {
    const entry = objectMap.get(hash);
    const owners = incoming.get(hash) ?? [];
    const nonRootOwners = owners.filter((owner) => owner !== null);
    const isRoot = owners.includes(null);
    const ownership = objectKindReferenceRegistry[entry.kind].ownership;
    if (ownership === 'root-only' && (!isRoot || nonRootOwners.length > 0)) fail(`${entry.kind} ${hash} violates root-only ownership`);
    if (ownership === 'unique' && (isRoot || nonRootOwners.length !== 1)) fail(`${entry.kind} ${hash} must have one logical owner`);
    if (ownership === 'shareable' && isRoot) fail(`${entry.kind} ${hash} cannot be a direct root`);
  }
  const logicalReferenceCount = edgeOccurrences.length;
  const uniqueObjectCount = closure.length;
  const logicalCanonicalBodyBytes = edgeOccurrences.reduce((sum, reference) => sum + objectMap.get(reference.hash).canonicalBodyBytes, 0);
  const uniqueCanonicalBodyBytes = closure.reduce((sum, hash) => sum + objectMap.get(hash).canonicalBodyBytes, 0);
  const dedupStatistics = {
    logicalReferenceCount,
    uniqueObjectCount,
    logicalCanonicalBodyBytes,
    uniqueCanonicalBodyBytes,
    savedObjectOccurrences: logicalReferenceCount - uniqueObjectCount,
    savedCanonicalBodyBytes: logicalCanonicalBodyBytes - uniqueCanonicalBodyBytes
  };
  for (const [key, value] of Object.entries(dedupStatistics)) assertSafeInteger(value, `dedupStatistics.${key}`);
  if (dedupStatistics.savedObjectOccurrences < 0 || dedupStatistics.savedCanonicalBodyBytes < 0) fail('dedup statistics must not be negative');
  return { roots, closure, dedupStatistics };
}

function canonicalIndexRecord(roots, indexedHashes, dedupStatistics) {
  return {
    recordType: 'index',
    schemaVersion: EVIDENCE_ARCHIVE_SCHEMA_VERSION,
    rootReferences: roots,
    indexedHashes,
    dedupStatistics
  };
}

function canonicalObjectRecord(entry) {
  return {
    recordType: 'object',
    hash: entry.hash,
    kind: entry.kind,
    canonicalBodyBytes: entry.canonicalBodyBytes,
    body: entry.body
  };
}

export function projectEvidenceArchive(objects, rootReferences, rootProjection) {
  const objectMap = asObjectMap(objects);
  const { roots, closure, dedupStatistics } = computeGraph(objectMap, validateArchiveRootMode(rootReferences, rootProjection));
  const indexRecord = canonicalIndexRecord(roots, closure, dedupStatistics);
  const records = [indexRecord, ...closure.map((hash) => canonicalObjectRecord(objectMap.get(hash)))];
  const lines = records.map((record) => `${stableStringify(record)}\n`);
  const canonicalJsonl = Buffer.from(lines.join(''), 'utf8');
  const maximumRecordBytes = lines.reduce((maximum, line) => Math.max(maximum, Buffer.byteLength(line, 'utf8')), 0);
  return {
    rootReferences: roots,
    indexedHashes: closure,
    objectIndex: indexRecord,
    objectIndexSha256: canonicalSha256(indexRecord),
    canonicalJsonl,
    canonicalArchiveSha256: crypto.createHash('sha256').update(canonicalJsonl).digest('hex'),
    expandedJsonlBytes: canonicalJsonl.length,
    maximumRecordBytes,
    objectCount: closure.length,
    recordCount: records.length,
    dedupStatistics,
    objects: new Map(closure.map((hash) => [hash, objectMap.get(hash)]))
  };
}

function deterministicCorpus() {
  const highEntropy = Buffer.allocUnsafe(1024 * 1024);
  let state = 0x9e3779b9;
  for (let index = 0; index < highEntropy.length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    highEntropy[index] = state & 0xff;
  }
  return [
    Buffer.alloc(0),
    Buffer.from('a'),
    Buffer.alloc(32768, 0x61),
    Buffer.alloc(65535, 0x61),
    Buffer.alloc(65536, 0x61),
    Buffer.from(Array.from({ length: 65536 }, (_, index) => (index % 2 === 0 ? 'a' : 'b')).join('')),
    highEntropy
  ];
}

function normalizeGzipHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 18 || buffer[0] !== 0x1f || buffer[1] !== 0x8b || buffer[2] !== 8) {
    fail('gzip encoder did not produce a valid gzip header');
  }
  if (buffer[3] !== 0) fail('gzip header must not contain optional fields');
  const normalized = Buffer.from(buffer);
  CANONICAL_GZIP_HEADER.copy(normalized, 0);
  if (!normalized.subarray(0, CANONICAL_GZIP_HEADER.length).equals(CANONICAL_GZIP_HEADER)) {
    fail('gzip encoder did not produce the canonical v1 header');
  }
  return normalized;
}

function* canonicalInputFrames(input, inputChunkBytes) {
  for (let offset = 0; offset < input.length; offset += inputChunkBytes) {
    yield input.subarray(offset, Math.min(input.length, offset + inputChunkBytes));
  }
}

export function frameCanonicalInput(input, inputChunkBytes = 65536) {
  if (!Buffer.isBuffer(input)) input = Buffer.from(input);
  assertSafeInteger(inputChunkBytes, 'inputChunkBytes', 1);
  return [...canonicalInputFrames(input, inputChunkBytes)];
}

function writeGzipFrame(gzip, frame) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      gzip.off('drain', onDrain);
      reject(error);
    };
    const onDrain = () => {
      gzip.off('error', onError);
      resolve();
    };
    try {
      if (gzip.write(frame)) {
        resolve();
        return;
      }
      gzip.once('drain', onDrain);
      gzip.once('error', onError);
    } catch (error) {
      reject(error);
    }
  });
}

async function gzipBytes(input, settings = {}) {
  if (!Buffer.isBuffer(input)) input = Buffer.from(input);
  const options = {
    level: 9,
    strategy: zlib.constants.Z_DEFAULT_STRATEGY,
    windowBits: 15,
    memLevel: 8,
    flush: zlib.constants.Z_NO_FLUSH,
    finishFlush: zlib.constants.Z_FINISH,
    ...settings
  };
  if (options.level !== 9 || options.strategy !== zlib.constants.Z_DEFAULT_STRATEGY || options.windowBits !== 15 || options.memLevel !== 8 || options.flush !== zlib.constants.Z_NO_FLUSH || options.finishFlush !== zlib.constants.Z_FINISH) {
    fail('gzip settings do not match the closed compressor configuration');
  }
  return new Promise((resolve, reject) => {
    const gzip = zlib.createGzip(options);
    const output = [];
    gzip.on('data', (chunk) => output.push(Buffer.from(chunk)));
    gzip.once('error', reject);
    gzip.once('end', () => {
      try {
        resolve(normalizeGzipHeader(Buffer.concat(output)));
      } catch (error) {
        reject(error);
      }
    });
    (async () => {
      try {
        for (const frame of canonicalInputFrames(input, 65536)) {
          // The transform receives each exact 65,536-byte frame under Z_NO_FLUSH.
          await writeGzipFrame(gzip, frame);
        }
        gzip.end();
      } catch (error) {
        gzip.destroy(error);
      }
    })();
  });
}

export async function computeCompressorProbeFingerprint({ corpus = deterministicCorpus(), settings = {} } = {}) {
  if (!Array.isArray(corpus) || corpus.length === 0) fail('compressor probe corpus must be a nonempty array');
  const records = [];
  for (const [index, entry] of corpus.entries()) {
    const input = Buffer.isBuffer(entry) ? entry : Buffer.from(entry);
    const output = await gzipBytes(input, settings);
    records.push({
      index,
      inputBytes: input.length,
      inputSha256: crypto.createHash('sha256').update(input).digest('hex'),
      outputBytes: output.length,
      outputSha256: crypto.createHash('sha256').update(output).digest('hex')
    });
  }
  return canonicalSha256({ version: 1, records });
}

/**
 * @param {{ compressorProbePolicyHash: string }} options
 */
let defaultCompressorProbePromise = null;

function defaultCompressorProbeFingerprint() {
  if (!defaultCompressorProbePromise) {
    defaultCompressorProbePromise = computeCompressorProbeFingerprint().catch((error) => {
      defaultCompressorProbePromise = null;
      throw error;
    });
  }
  return defaultCompressorProbePromise;
}

export async function createCompressorIdentity(options = /** @type {any} */ ({})) {
  assertExactKeys(options, ['compressorProbePolicyHash'], 'compressor identity options');
  const { compressorProbePolicyHash } = options;
  assertSha(compressorProbePolicyHash, 'compressorProbePolicyHash');
  const compressorProbeSha256 = await defaultCompressorProbeFingerprint();
  return {
    codec: 'node:zlib.gzip',
    nodeVersion: process.version,
    zlibVersion: process.versions.zlib,
    level: 9,
    strategy: 'Z_DEFAULT_STRATEGY',
    windowBits: 15,
    memLevel: 8,
    inputChunkBytes: 65536,
    intermediateFlush: 'Z_NO_FLUSH',
    finishFlush: 'Z_FINISH',
    mtime: 0,
    filename: null,
    comment: null,
    osByte: 255,
    compressorProbePolicyHash,
    compressorProbeSha256
  };
}

function resolveArchiveCompressorIdentity(compressorProbePolicyHash, compressorIdentity) {
  const expectedIdentity = compressorIdentity === undefined
    ? undefined
    : validateCompressorIdentity(compressorIdentity);
  if (compressorProbePolicyHash !== undefined) {
    assertSha(compressorProbePolicyHash, 'compressorProbePolicyHash');
    if (expectedIdentity && expectedIdentity.compressorProbePolicyHash !== compressorProbePolicyHash) {
      fail('compressorProbePolicyHash does not match compressorIdentity.compressorProbePolicyHash');
    }
  }
  const policyHash = compressorProbePolicyHash ?? expectedIdentity?.compressorProbePolicyHash;
  if (policyHash === undefined) {
    fail('writeEvidenceArchive requires compressorProbePolicyHash or compressorIdentity');
  }
  return { expectedIdentity, compressorProbePolicyHash: policyHash };
}

function publicationThreshold(hardLimit, policy) {
  const value = Math.floor((hardLimit * policy.numerator) / policy.denominator);
  if (!Number.isSafeInteger(value)) fail('publication threshold exceeds safe integer precision');
  return value;
}

/**
 * @param {{ rootBytes: number, compressedBytes: number, expandedJsonlBytes: number, maximumRecordBytes: number, objectCount: number, recordCount: number }} values
 * @param {{ limits?: EvidenceLimits, headroomPolicy?: { numerator: number, denominator: number } }} options
 */
export function measureEvidenceArchiveUtilization({ rootBytes, compressedBytes, expandedJsonlBytes, maximumRecordBytes, objectCount, recordCount }, { limits = EVIDENCE_HARD_LIMITS, headroomPolicy = publicationHeadroomPolicy } = {}) {
  assertObject(limits, 'limits');
  assertSafeInteger(headroomPolicy.numerator, 'headroomPolicy.numerator', 1);
  assertSafeInteger(headroomPolicy.denominator, 'headroomPolicy.denominator', 1);
  if (headroomPolicy.numerator >= headroomPolicy.denominator) fail('headroomPolicy must be below 100%');
  const raw = { rootBytes, compressedBytes, expandedJsonlBytes, maximumRecordBytes, objectCount, recordCount };
  for (const [key, value] of Object.entries(raw)) assertSafeInteger(value, key);
  if (recordCount !== objectCount + 1) fail('recordCount must equal objectCount + 1');
  const hard = {
    rootBytes: limits.maxRootBytes,
    compressedBytes: limits.maxCompressedBytes,
    expandedJsonlBytes: limits.maxExpandedJsonlBytes,
    maximumRecordBytes: limits.maxRecordBytes,
    objectCount: limits.maxIndexedObjects,
    recordCount: limits.maxTotalRecords
  };
  for (const [key, value] of Object.entries(hard)) assertSafeInteger(value, `limits.${key}`, 1);
  const directFloors = {
    rootBytes: publicationThreshold(hard.rootBytes, headroomPolicy),
    compressedBytes: publicationThreshold(hard.compressedBytes, headroomPolicy),
    expandedJsonlBytes: publicationThreshold(hard.expandedJsonlBytes, headroomPolicy),
    maximumRecordBytes: publicationThreshold(hard.maximumRecordBytes, headroomPolicy),
    recordCount: publicationThreshold(hard.recordCount, headroomPolicy),
    objectCountRaw: publicationThreshold(hard.objectCount, headroomPolicy)
  };
  const effectiveObjectLimit = Math.min(directFloors.objectCountRaw, directFloors.recordCount - 1);
  const publication = {
    rootBytes: directFloors.rootBytes,
    compressedBytes: directFloors.compressedBytes,
    expandedJsonlBytes: directFloors.expandedJsonlBytes,
    maximumRecordBytes: directFloors.maximumRecordBytes,
    objectCount: effectiveObjectLimit,
    recordCount: directFloors.recordCount
  };
  const hardFailures = Object.keys(raw).filter((key) => raw[key] > hard[key]);
  const publicationFailures = Object.keys(raw).filter((key) => raw[key] > publication[key]);
  return {
    raw,
    hardLimits: hard,
    directFloors,
    effectiveObjectLimit,
    publicationLimits: publication,
    utilization: Object.fromEntries(Object.keys(raw).map((key) => [key, raw[key] / publication[key]])),
    hardLimitPassed: hardFailures.length === 0,
    publicationHeadroomPassed: publicationFailures.length === 0,
    hardFailures,
    publicationFailures
  };
}

function ensureProjectionWithinHardLimits(projection, rootBytes, limits = EVIDENCE_HARD_LIMITS) {
  const utilization = measureEvidenceArchiveUtilization({
    rootBytes,
    compressedBytes: 0,
    expandedJsonlBytes: projection.expandedJsonlBytes,
    maximumRecordBytes: projection.maximumRecordBytes,
    objectCount: projection.objectCount,
    recordCount: projection.recordCount
  }, { limits });
  if (!utilization.hardLimitPassed) fail(`evidence archive exceeds hard limits: ${utilization.hardFailures.join(', ')}`);
  return utilization;
}

export function createEvidenceStore({ hashObject = objectHash } = {}) {
  if (typeof hashObject !== 'function') fail('hashObject must be a function');
  const objects = new Map();
  return {
    putObject(kind, body) {
      if (!objectKindReferenceRegistry[kind]) fail(`unknown evidence object kind ${kind}`);
      assertObject(body, 'object body');
      const canonicalBodyBytes = Buffer.byteLength(stableStringify(body), 'utf8');
      const hash = hashObject(kind, body);
      assertSha(hash, 'object hash');
      const existing = objects.get(hash);
      if (existing) {
        if (existing.kind !== kind || stableStringify(existing.body) !== stableStringify(body)) {
          fail(`hash collision for ${hash}`);
        }
        return { hash, kind: existing.kind, body: clone(existing.body), canonicalBodyBytes: existing.canonicalBodyBytes, deduplicated: true };
      }
      const entry = { hash, kind, body: clone(body), canonicalBodyBytes };
      objects.set(hash, entry);
      return { ...entry, deduplicated: false };
    },
    getObject(hash) {
      assertSha(hash, 'object hash');
      const entry = objects.get(hash);
      return entry ? clone(entry) : null;
    },
    objectMap() {
      return new Map([...objects.entries()].map(([hash, entry]) => [hash, clone(entry)]));
    },
    project(rootReferences, rootProjection) {
      return projectEvidenceArchive(objects, rootReferences, rootProjection);
    },
    size() {
      return objects.size;
    }
  };
}

function atomicWrite(outputPath, bytes) {
  const directory = path.dirname(outputPath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(outputPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, outputPath);
  } catch (error) {
    try {
      fs.rmSync(temporary, { force: true });
    } catch {
      // Preserve the primary failure.
    }
    throw error;
  }
}

function createBeforeWriteMetadataSnapshot(archive) {
  const metadata = {};
  for (const [key, value] of Object.entries(archive)) {
    if (key === 'gzip' || key === 'canonicalJsonl' || key === 'objects') continue;
    metadata[key] = value;
  }
  return deepFreeze(clone(metadata));
}

function assertSealedArchiveGzip(gzip, archive) {
  if (!Buffer.isBuffer(gzip)) fail('sealed archive gzip must be a buffer');
  if (gzip.length !== archive.compressedBytes) fail('sealed archive gzip byte count does not match transport metadata');
  const gzipSha256 = crypto.createHash('sha256').update(gzip).digest('hex');
  if (gzipSha256 !== archive.compressedArchiveSha256) fail('sealed archive gzip hash does not match transport metadata');
}

/**
 * Encode canonical archive bytes through the closed production gzip transport. This is
 * intentionally available to decoder-boundary fixtures: malformed canonical streams
 * must still be encoded with the exact transport implementation production uses.
 *
 * `compressorIdentity`, when supplied, is an expected assertion only. The returned
 * identity always comes from this codec's actual Node/zlib settings and probe bytes.
 *
 * @param {Buffer|string} canonicalJsonl
 * @param {{ compressorProbePolicyHash?: string, compressorIdentity?: any }} options
 */
export async function encodeCanonicalEvidenceArchive(canonicalJsonl, { compressorProbePolicyHash = undefined, compressorIdentity = undefined } = {}) {
  const input = Buffer.isBuffer(canonicalJsonl) ? canonicalJsonl : Buffer.from(canonicalJsonl);
  const transport = resolveArchiveCompressorIdentity(compressorProbePolicyHash, compressorIdentity);
  const identity = await createCompressorIdentity({ compressorProbePolicyHash: transport.compressorProbePolicyHash });
  if (transport.expectedIdentity) assertCompressorIdentityMatches(identity, transport.expectedIdentity);
  const gzip = await gzipBytes(input);
  return {
    gzip,
    compressedBytes: gzip.length,
    compressedArchiveSha256: crypto.createHash('sha256').update(gzip).digest('hex'),
    canonicalArchiveSha256: crypto.createHash('sha256').update(input).digest('hex'),
    compressorIdentity: identity
  };
}

/**
 * Encode a complete typed archive through the canonical production codec without
 * publishing it. This is deliberately separate from `writeEvidenceArchive`: callers
 * that need to exercise decoder rejection paths can create an over-limit byte stream,
 * while the publication API below remains fail-closed before it writes anything.
 */
async function encodeProjectedEvidenceArchive(projection, { rootBytes, compressorProbePolicyHash = undefined, compressorIdentity = undefined, limits = EVIDENCE_HARD_LIMITS }) {
  const encoded = await encodeCanonicalEvidenceArchive(projection.canonicalJsonl, {
    compressorProbePolicyHash,
    compressorIdentity
  });
  const utilization = measureEvidenceArchiveUtilization({
    rootBytes,
    compressedBytes: encoded.compressedBytes,
    expandedJsonlBytes: projection.expandedJsonlBytes,
    maximumRecordBytes: projection.maximumRecordBytes,
    objectCount: projection.objectCount,
    recordCount: projection.recordCount
  }, { limits });
  return {
    ...projection,
    ...encoded,
    utilization
  };
}

/**
 * @param {{ objects: any, rootReferences: any, rootProjection: any, rootBytes: number, compressorProbePolicyHash?: string, compressorIdentity?: any, limits?: EvidenceLimits }} input
 */
export async function encodeEvidenceArchive({ objects, rootReferences, rootProjection, rootBytes, compressorProbePolicyHash = undefined, compressorIdentity = undefined, limits = EVIDENCE_HARD_LIMITS }) {
  const projection = projectEvidenceArchive(objects, rootReferences, rootProjection);
  return encodeProjectedEvidenceArchive(projection, {
    rootBytes,
    compressorProbePolicyHash,
    compressorIdentity,
    limits: normalizeReplayLimits(limits)
  });
}

/**
 * `beforeWrite` receives only a deeply frozen, detached metadata snapshot. It never
 * receives archive bytes or the object graph that will be persisted.
 *
 * @param {{ outputPath?: string, objects: any, rootReferences: any, rootProjection: any, rootBytes: number, compressorProbePolicyHash?: string, compressorIdentity?: any, limits?: EvidenceLimits, beforeWrite?: (archiveMetadata: any) => void|Promise<void> }} input
 */
export async function writeEvidenceArchive({ outputPath, objects, rootReferences, rootProjection, rootBytes, compressorProbePolicyHash = undefined, compressorIdentity = undefined, limits = EVIDENCE_HARD_LIMITS, beforeWrite = undefined }) {
  if (beforeWrite !== undefined && typeof beforeWrite !== 'function') fail('writeEvidenceArchive beforeWrite must be a function');
  const normalizedLimits = normalizeReplayLimits(limits);
  const projection = projectEvidenceArchive(objects, rootReferences, rootProjection);
  ensureProjectionWithinHardLimits(projection, rootBytes, normalizedLimits);
  const archive = await encodeProjectedEvidenceArchive(projection, {
    rootBytes,
    compressorProbePolicyHash,
    compressorIdentity,
    limits: normalizedLimits
  });
  if (!archive.utilization.hardLimitPassed) {
    fail(`evidence archive exceeds hard limits: ${archive.utilization.hardFailures.join(', ')}`);
  }
  const sealedGzip = Buffer.from(archive.gzip);
  assertSealedArchiveGzip(sealedGzip, archive);
  if (beforeWrite) await beforeWrite(createBeforeWriteMetadataSnapshot(archive));
  assertSealedArchiveGzip(sealedGzip, archive);
  if (outputPath) atomicWrite(outputPath, sealedGzip);
  return { ...archive, gzip: Buffer.from(sealedGzip) };
}

function parseCanonicalRecord(lineBuffer, index, limits) {
  const bytes = lineBuffer.length + 1;
  if (bytes > limits.maxRecordBytes) fail(`record ${index} exceeds the per-record hard limit`);
  let line;
  try {
    line = lineBuffer.toString('utf8');
  } catch (error) {
    fail(`record ${index} cannot be decoded as UTF-8: ${error.message}`);
  }
  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    fail(`record ${index} is not JSON: ${error.message}`);
  }
  if (stableStringify(record) !== line) fail(`record ${index} is not canonical JSON`);
  return record;
}

function normalizeReplayLimits(limits = EVIDENCE_HARD_LIMITS) {
  assertExactKeys(limits, Object.keys(EVIDENCE_HARD_LIMITS), 'replay limits');
  const normalized = {};
  for (const [key, hardLimit] of Object.entries(EVIDENCE_HARD_LIMITS)) {
    assertSafeInteger(limits[key], `replay limits.${key}`, 1);
    if (limits[key] > hardLimit) {
      fail(`replay limits.${key} relaxes the V1 hard cap`);
    }
    // Preserve the hard cap even if this function is reused with a value that is
    // semantically equal to the cap through a different numeric representation.
    normalized[key] = Math.min(limits[key], hardLimit);
  }
  return Object.freeze(normalized);
}

function updateCrc32(crc, chunk) {
  let value = crc >>> 0;
  for (const byte of chunk) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

class CanonicalGzipMemberFramer extends Transform {
  constructor() {
    super();
    this.header = Buffer.alloc(0);
    this.trailing = Buffer.alloc(0);
    this.deflateBytes = 0;
    this.trailer = null;
  }

  _transform(chunk, _encoding, callback) {
    try {
      let input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (this.header.length < CANONICAL_GZIP_HEADER.length) {
        const needed = CANONICAL_GZIP_HEADER.length - this.header.length;
        const consumed = Math.min(needed, input.length);
        this.header = Buffer.concat([this.header, input.subarray(0, consumed)]);
        input = input.subarray(consumed);
        if (this.header.length === CANONICAL_GZIP_HEADER.length && !this.header.equals(CANONICAL_GZIP_HEADER)) {
          fail('gzip header is not the canonical V1 header');
        }
      }
      if (this.header.length < CANONICAL_GZIP_HEADER.length) {
        callback();
        return;
      }
      const buffered = this.trailing.length === 0 ? input : Buffer.concat([this.trailing, input]);
      if (buffered.length <= 8) {
        this.trailing = Buffer.from(buffered);
        callback();
        return;
      }
      const deflate = buffered.subarray(0, buffered.length - 8);
      this.deflateBytes += deflate.length;
      this.trailing = Buffer.from(buffered.subarray(buffered.length - 8));
      this.push(deflate);
      callback();
    } catch (error) {
      callback(error);
    }
  }

  _flush(callback) {
    if (this.header.length !== CANONICAL_GZIP_HEADER.length) {
      callback(new Error('gzip member is shorter than its canonical header'));
      return;
    }
    if (this.trailing.length !== 8) {
      callback(new Error('gzip member is missing its canonical trailer'));
      return;
    }
    this.trailer = Buffer.from(this.trailing);
    callback();
  }
}

function readGzipJsonlWithCaps(inputPath, limits) {
  return new Promise((resolve, reject) => {
    const compressedHash = crypto.createHash('sha256');
    const expandedHash = crypto.createHash('sha256');
    const source = fs.createReadStream(inputPath, { highWaterMark: 65536 });
    const framer = new CanonicalGzipMemberFramer();
    const inflater = zlib.createInflateRaw({
      flush: zlib.constants.Z_NO_FLUSH,
      finishFlush: zlib.constants.Z_FINISH
    });
    let compressedBytes = 0;
    let expandedBytes = 0;
    let trailing = Buffer.alloc(0);
    const records = [];
    let indexedObjectRecordCount = 0;
    let settled = false;
    let crc32 = 0xffffffff;
    const abort = (error) => {
      if (settled) return;
      settled = true;
      source.destroy();
      framer.destroy();
      inflater.destroy();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    source.on('data', (chunk) => {
      compressedBytes += chunk.length;
      if (compressedBytes > limits.maxCompressedBytes) {
        abort(new Error('compressed archive exceeds its hard limit'));
        return;
      }
      compressedHash.update(chunk);
    });
    source.once('error', (error) => abort(new Error(`archive cannot be read: ${error.message}`)));
    framer.once('error', (error) => abort(new Error(`archive gzip framing is invalid: ${error.message}`)));
    inflater.once('error', (error) => abort(new Error(`archive cannot be decoded: ${error.message}`)));
    inflater.on('data', (chunk) => {
      if (settled) return;
      expandedBytes += chunk.length;
      if (expandedBytes > limits.maxExpandedJsonlBytes) {
        abort(new Error('expanded archive exceeds its hard limit'));
        return;
      }
      expandedHash.update(chunk);
      crc32 = updateCrc32(crc32, chunk);
      let offset = 0;
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset);
        const lineEnd = newline < 0 ? chunk.length : newline;
        const segment = chunk.subarray(offset, lineEnd);
        const recordBytes = trailing.length + segment.length + (newline < 0 ? 0 : 1);
        if (recordBytes > limits.maxRecordBytes) {
          abort(new Error(`record ${records.length} exceeds the per-record hard limit`));
          return;
        }
        if (newline < 0) {
          trailing = trailing.length === 0 ? Buffer.from(segment) : Buffer.concat([trailing, segment]);
          break;
        }
        const line = trailing.length === 0 ? segment : Buffer.concat([trailing, segment]);
        trailing = Buffer.alloc(0);
        let record;
        try {
          record = parseCanonicalRecord(line, records.length, limits);
        } catch (error) {
          abort(error);
          return;
        }
        if (records.length === 0) {
          if (record.recordType !== 'index') {
            abort(new Error('archive must begin with an index record'));
            return;
          }
          if (Array.isArray(record.indexedHashes) && record.indexedHashes.length > limits.maxIndexedObjects) {
            abort(new Error('archive index exceeds the indexed-object hard limit'));
            return;
          }
        } else if (record.recordType === 'object' && indexedObjectRecordCount >= limits.maxIndexedObjects) {
          abort(new Error('archive exceeds the indexed-object hard limit'));
          return;
        }
        if (records.length >= limits.maxTotalRecords) {
          abort(new Error('archive exceeds the total-record hard limit'));
          return;
        }
        if (records.length > 0 && record.recordType !== 'object') {
          abort(new Error(`record ${records.length} must be an object record`));
          return;
        }
        if (records.length > 0) indexedObjectRecordCount += 1;
        records.push(record);
        offset = newline + 1;
      }
    });
    inflater.once('end', () => {
      if (settled) return;
      if (trailing.length !== 0 || expandedBytes === 0) {
        abort(new Error('canonical JSONL archive must end with one LF'));
        return;
      }
      if (!framer.trailer || inflater.bytesWritten !== framer.deflateBytes) {
        abort(new Error('gzip archive must contain exactly one member with no trailing input'));
        return;
      }
      const expectedCrc32 = framer.trailer.readUInt32LE(0);
      const expectedSize = framer.trailer.readUInt32LE(4);
      if (((crc32 ^ 0xffffffff) >>> 0) !== expectedCrc32 || (expandedBytes >>> 0) !== expectedSize) {
        abort(new Error('gzip trailer checksum or size is invalid'));
        return;
      }
      settled = true;
      resolve({
        records,
        compressedBytes,
        expandedJsonlBytes: expandedBytes,
        compressedArchiveSha256: compressedHash.digest('hex'),
        canonicalArchiveSha256: expandedHash.digest('hex')
      });
    });
    source.pipe(framer).pipe(inflater);
  });
}

/**
 * @param {string} inputPath
 * @param {{
 *   compressedArchiveSha256?: string,
 *   canonicalArchiveSha256?: string,
 *   objectIndexSha256?: string,
 *   expectedExpandedJsonlBytes?: number,
 *   expectedRecordCount?: number,
 *   limits?: EvidenceLimits,
 *   rootProjection: { mode: string, rootReferences: Array<{ kind: string, hash: string }>, coreReferences?: Array<{ kind: string, hash: string }>, resolvedReferences?: Array<{ kind: string, hash: string }> }
 * }} options
 */
export async function readEvidenceArchive(inputPath, {
  compressedArchiveSha256 = undefined,
  canonicalArchiveSha256 = undefined,
  objectIndexSha256 = undefined,
  expectedExpandedJsonlBytes = undefined,
  expectedRecordCount = undefined,
  limits = EVIDENCE_HARD_LIMITS,
  rootProjection
} = {}) {
  try {
    const normalizedLimits = normalizeReplayLimits(limits);
    const context = createRootProjectionContext(rootProjection);
    const streamed = await readGzipJsonlWithCaps(inputPath, normalizedLimits);
    if (compressedArchiveSha256 && streamed.compressedArchiveSha256 !== compressedArchiveSha256) fail('compressed archive hash mismatch');
    const records = streamed.records;
    if (records.length === 0 || records[0].recordType !== 'index') fail('archive must begin with an index record');
    const index = records[0];
    if (index.schemaVersion !== EVIDENCE_ARCHIVE_SCHEMA_VERSION) fail('archive index schema version is invalid');
    const objects = new Map();
    for (const [position, record] of records.slice(1).entries()) {
      if (record.recordType !== 'object') fail(`record ${position + 1} must be an object record`);
      const entry = normalizeStoredObject({ hash: record.hash, kind: record.kind, body: record.body, canonicalBodyBytes: record.canonicalBodyBytes }, `record ${position + 1}`);
      if (objects.has(entry.hash)) fail(`archive contains duplicate object ${entry.hash}`);
      objects.set(entry.hash, entry);
    }
    const projection = projectEvidenceArchive(objects, index.rootReferences, context);
    if (projection.objectCount > normalizedLimits.maxIndexedObjects) {
      fail('archive exceeds the indexed-object hard limit');
    }
    if (stableStringify(projection.objectIndex) !== stableStringify(index)) fail('archive index does not match the graph projection');
    if (projection.canonicalArchiveSha256 !== streamed.canonicalArchiveSha256 || projection.expandedJsonlBytes !== streamed.expandedJsonlBytes) {
      fail('archive JSONL ordering or bytes are noncanonical');
    }
    if (canonicalArchiveSha256 && projection.canonicalArchiveSha256 !== canonicalArchiveSha256) fail('canonical archive hash mismatch');
    if (objectIndexSha256 && projection.objectIndexSha256 !== objectIndexSha256) fail('object index hash mismatch');
    if (expectedExpandedJsonlBytes !== undefined && projection.expandedJsonlBytes !== expectedExpandedJsonlBytes) fail('expanded archive byte count mismatch');
    if (expectedRecordCount !== undefined && projection.recordCount !== expectedRecordCount) fail('archive record count mismatch');
    return { ...projection, compressedBytes: streamed.compressedBytes, compressedArchiveSha256: streamed.compressedArchiveSha256 };
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('Baseline evidence store failed:')) throw error;
    fail(error.message);
  }
}
