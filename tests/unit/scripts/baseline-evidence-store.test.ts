import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalSha256, stableStringify } from '../../../scripts/lib/baseline-report.js';
import {
  computeCompressorProbeFingerprint,
  createCompressorIdentity,
  createEvidenceStore,
  EVIDENCE_HARD_LIMITS,
  encodeCanonicalEvidenceArchive,
  frameCanonicalInput,
  objectKindReferenceRegistry,
  projectEvidenceArchive,
  readEvidenceArchive,
  validateArchiveRootMode,
  writeEvidenceArchive
} from '../../../scripts/lib/baseline-evidence-store.js';

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

function refs(...references: { kind: string; hash: string }[]) {
  return references.sort((left, right) => `${left.kind}:${left.hash}`.localeCompare(`${right.kind}:${right.hash}`));
}

function createCoreGraph({
  extraDictionaries = 0,
  rawChunkBody = undefined
}: {
  extraDictionaries?: number
  rawChunkBody?: (dictionaryReference: { kind: string; hash: string }) => Record<string, unknown>
} = {}) {
  const store = createEvidenceStore();
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const singleton = store.putObject('singleton-report', { evidenceId });
    return { kind: singleton.kind, hash: singleton.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:test:release' });
  const dictionaryReferences = Array.from({ length: extraDictionaries + 1 }, (_, index) => {
    const dictionary = store.putObject('dictionary', { values: [index === 0 ? 'one' : `extra-${index}`] });
    return { kind: dictionary.kind, hash: dictionary.hash };
  });
  const chunk = store.putObject('raw-chunk', rawChunkBody?.(dictionaryReferences[0]) ?? { values: [1] });
  const rawManifest = store.putObject('raw-kind-manifest', {
    chunkReferences: refs({ kind: chunk.kind, hash: chunk.hash }),
    dictionaryReferences: refs(...dictionaryReferences)
  });
  const child = store.putObject('experiment-child-manifest', {
    rawKindManifestReferences: refs({ kind: rawManifest.kind, hash: rawManifest.hash })
  });
  const parent = store.putObject('ci-experiment-parent', { childManifest: { kind: child.kind, hash: child.hash } });
  const rootReferences = refs(...singletonReferences, { kind: packageReport.kind, hash: packageReport.hash }, { kind: parent.kind, hash: parent.hash });
  return { store, rootReferences, rootProjection: { mode: 'core', rootReferences }, child };
}

function createMultiplyOwnedUniqueGraph(kind: 'run' | 'aggregate' | 'comparison' | 'qualification') {
  const fields = {
    run: 'runReferences',
    aggregate: 'aggregateReferences',
    comparison: 'comparisonReferences',
    qualification: 'qualificationReferences'
  } as const;
  const store = createEvidenceStore();
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const singleton = store.putObject('singleton-report', { evidenceId });
    return { kind: singleton.kind, hash: singleton.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:ownership:release' });
  const shared = store.putObject(kind, { fixture: 'multiply-owned' });
  const field = fields[kind];
  const firstChild = store.putObject('experiment-child-manifest', {
    fixtureOwner: 'ci',
    [field]: refs({ kind: shared.kind, hash: shared.hash })
  });
  const secondChild = store.putObject('experiment-child-manifest', {
    fixtureOwner: 'reference',
    [field]: refs({ kind: shared.kind, hash: shared.hash })
  });
  const ciParent = store.putObject('ci-experiment-parent', {
    childManifest: { kind: firstChild.kind, hash: firstChild.hash }
  });
  const referenceParent = store.putObject('reference-experiment-parent', {
    childManifest: { kind: secondChild.kind, hash: secondChild.hash }
  });
  const coreReferences = refs(
    ...singletonReferences,
    { kind: packageReport.kind, hash: packageReport.hash },
    { kind: ciParent.kind, hash: ciParent.hash }
  );
  const rootReferences = refs(...coreReferences, { kind: referenceParent.kind, hash: referenceParent.hash });
  return {
    store,
    rootReferences,
    rootProjection: { mode: 'selected-reference' as const, rootReferences, coreReferences }
  };
}

describe('baseline evidence object store', () => {
  it('binds hashes to kind and body, and deduplicates only exact equal entries', () => {
    const store = createEvidenceStore();
    const first = store.putObject('singleton-report', { value: 1 });
    const duplicate = store.putObject('singleton-report', { value: 1 });
    const differentKind = store.putObject('package-report', { value: 1 });
    expect(duplicate.deduplicated).toBe(true);
    expect(first.hash).not.toBe(differentKind.hash);
    expect(store.size()).toBe(2);
  });

  it('projects a typed graph and round-trips deterministic canonical gzip', async () => {
    const { store, rootReferences, rootProjection } = createCoreGraph();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-store-'));
    roots.push(root);
    const output = path.join(root, 'evidence.jsonl.gz');
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const written = await writeEvidenceArchive({
      outputPath: output,
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const replayed = await readEvidenceArchive(output, {
      compressedArchiveSha256: written.compressedArchiveSha256,
      canonicalArchiveSha256: written.canonicalArchiveSha256,
      objectIndexSha256: written.objectIndexSha256,
      expectedExpandedJsonlBytes: written.expandedJsonlBytes,
      expectedRecordCount: written.recordCount,
      rootProjection
    });
    expect(replayed.indexedHashes).toEqual(written.indexedHashes);
    expect(written.utilization.hardLimitPassed).toBe(true);
  });

  it('keeps the published archive sealed from beforeWrite callback mutations', async () => {
    const { store, rootReferences, rootProjection } = createCoreGraph();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-before-write-'));
    roots.push(root);
    const output = path.join(root, 'sealed.jsonl.gz');
    const rejectedOutput = path.join(root, 'rejected.jsonl.gz');
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const oversizedReplacement = Buffer.alloc(EVIDENCE_HARD_LIMITS.maxCompressedBytes + 1, 0x61);
    const mutationErrors: unknown[] = [];
    let callbackMetadata: any;
    const written = await writeEvidenceArchive({
      outputPath: output,
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity,
      beforeWrite: (metadata) => {
        callbackMetadata = metadata;
        expect(Object.isFrozen(metadata)).toBe(true);
        expect(Object.isFrozen(metadata.compressorIdentity)).toBe(true);
        expect(Object.isFrozen(metadata.utilization.raw)).toBe(true);
        expect(metadata.gzip).toBeUndefined();
        expect(metadata.canonicalJsonl).toBeUndefined();
        expect(metadata.objects).toBeUndefined();
        const originalCompressedBytes = metadata.compressedBytes;
        try {
          metadata.gzip = oversizedReplacement;
        } catch (error) {
          mutationErrors.push(error);
        }
        try {
          metadata.utilization.raw.compressedBytes = EVIDENCE_HARD_LIMITS.maxCompressedBytes + 1;
        } catch (error) {
          mutationErrors.push(error);
        }
        expect(metadata.gzip).toBeUndefined();
        expect(metadata.compressedBytes).toBe(originalCompressedBytes);
        expect(metadata.utilization.raw.compressedBytes).toBe(originalCompressedBytes);
      }
    });
    expect(callbackMetadata).toBeDefined();
    expect(mutationErrors).toHaveLength(2);
    const persisted = fs.readFileSync(output);
    expect(persisted.equals(written.gzip)).toBe(true);
    expect(persisted.length).toBe(written.compressedBytes);
    await expect(readEvidenceArchive(output, {
      compressedArchiveSha256: written.compressedArchiveSha256,
      canonicalArchiveSha256: written.canonicalArchiveSha256,
      objectIndexSha256: written.objectIndexSha256,
      expectedExpandedJsonlBytes: written.expandedJsonlBytes,
      expectedRecordCount: written.recordCount,
      rootProjection
    })).resolves.toBeDefined();

    await expect(writeEvidenceArchive({
      outputPath: rejectedOutput,
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity,
      beforeWrite: (metadata) => {
        metadata.gzip = oversizedReplacement;
      }
    })).rejects.toThrow(TypeError);
    expect(fs.existsSync(rejectedOutput)).toBe(false);
  });

  it('derives archive transport provenance from its production encoder and rejects forged assertions', async () => {
    const { store, rootReferences, rootProjection } = createCoreGraph();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-provenance-'));
    roots.push(root);
    const compressorProbePolicyHash = 'a'.repeat(64);
    const derived = await createCompressorIdentity({ compressorProbePolicyHash });
    const written = await writeEvidenceArchive({
      outputPath: path.join(root, 'derived.jsonl.gz'),
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorProbePolicyHash
    });
    expect(written.compressorIdentity).toEqual(derived);

    const asserted = await writeEvidenceArchive({
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: derived
    });
    expect(asserted.compressorIdentity).toEqual(derived);
    expect(asserted.gzip.equals(written.gzip)).toBe(true);

    for (const forgedIdentity of [
      { ...derived, nodeVersion: 'v0.0.0' },
      { ...derived, zlibVersion: '0.0.0' },
      { ...derived, compressorProbeSha256: 'b'.repeat(64) }
    ]) {
      await expect(writeEvidenceArchive({
        objects: store.objectMap(),
        rootReferences,
        rootProjection,
        rootBytes: 1,
        compressorIdentity: forgedIdentity
      })).rejects.toThrow(/actual production encoder identity/);
    }
    await expect(createCompressorIdentity({
      compressorProbePolicyHash,
      compressorProbeSha256: 'b'.repeat(64)
    } as never)).rejects.toThrow(/unknown key/);
  });

  it('rejects a forced same-hash collision with different content', () => {
    const store = createEvidenceStore({ hashObject: () => 'a'.repeat(64) });
    store.putObject('singleton-report', { value: 1 });
    expect(() => store.putObject('singleton-report', { value: 2 })).toThrow(/collision/);
  });

  it('rejects conflicting object-map keys before graph traversal or archive output', async () => {
    const { store, rootReferences, rootProjection } = createCoreGraph();
    const objects = store.objectMap();
    const [canonicalHash, entry] = [...objects.entries()][0];
    const conflictingHash = 'f'.repeat(64);
    expect(conflictingHash).not.toBe(canonicalHash);
    const conflictingMap = new Map(objects);
    conflictingMap.delete(canonicalHash);
    conflictingMap.set(conflictingHash, entry);
    const conflictingObjectMap = Object.fromEntries([...conflictingMap.entries()]);
    expect(() => projectEvidenceArchive(conflictingMap, rootReferences, rootProjection)).toThrow(/keyed by the wrong hash/);
    expect(() => projectEvidenceArchive(conflictingObjectMap, rootReferences, rootProjection)).toThrow(/keyed by the wrong hash/);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-key-mismatch-'));
    roots.push(root);
    const output = path.join(root, 'must-not-exist.jsonl.gz');
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    await expect(writeEvidenceArchive({
      outputPath: output,
      objects: conflictingMap,
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    })).rejects.toThrow(/keyed by the wrong hash/);
    expect(fs.existsSync(output)).toBe(false);
    const validOutput = path.join(root, 'valid.jsonl.gz');
    await writeEvidenceArchive({
      outputPath: validOutput,
      objects,
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const records = zlib.gunzipSync(fs.readFileSync(validOutput)).toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
    records[1].hash = conflictingHash;
    const noncanonicalEntryArchive = await encodeCanonicalEvidenceArchive(
      Buffer.from(`${records.map((record) => stableStringify(record)).join('\n')}\n`, 'utf8'),
      { compressorIdentity: identity }
    );
    const corruptedOutput = path.join(root, 'conflicting-entry.jsonl.gz');
    fs.writeFileSync(corruptedOutput, noncanonicalEntryArchive.gzip);
    await expect(readEvidenceArchive(corruptedOutput, { rootProjection })).rejects.toThrow(/hash does not bind kind and body/);
  });

  it('deep-freezes the object-kind registry so ownership and edge matrices cannot be widened', () => {
    expect(Object.isFrozen(objectKindReferenceRegistry)).toBe(true);
    expect(Object.isFrozen(objectKindReferenceRegistry['raw-chunk'])).toBe(true);
    expect(Object.isFrozen(objectKindReferenceRegistry['raw-kind-manifest'].outgoing)).toBe(true);
    expect(() => {
      (objectKindReferenceRegistry['raw-chunk'] as any).ownership = 'shareable';
    }).toThrow();
    expect(() => {
      (objectKindReferenceRegistry['raw-kind-manifest'].outgoing as any).parentReference = { kind: 'ci-experiment-parent', cardinality: 'one' };
    }).toThrow();
    expect(() => {
      (objectKindReferenceRegistry['raw-kind-manifest'].outgoing.chunkReferences as any).kind = 'ci-experiment-parent';
    }).toThrow();
    expect(objectKindReferenceRegistry['raw-chunk'].ownership).toBe('unique');
    expect(objectKindReferenceRegistry['raw-kind-manifest'].outgoing.parentReference).toBeUndefined();
    expect(objectKindReferenceRegistry['raw-kind-manifest'].outgoing.chunkReferences.kind).toBe('raw-chunk');
    const { store, rootReferences, rootProjection } = createCoreGraph();
    expect(() => store.project(rootReferences, rootProjection)).not.toThrow();
  });

  it('rejects direct non-root graph entries, rehashed orphans, undeclared dictionary edges, and multiply-owned unique records', () => {
    const direct = createCoreGraph();
    const run = direct.store.putObject('run', { fixture: 'direct-root' });
    const qualification = direct.store.putObject('qualification', { fixture: 'direct-root' });
    for (const reference of [
      { kind: direct.child.kind, hash: direct.child.hash },
      { kind: run.kind, hash: run.hash },
      { kind: qualification.kind, hash: qualification.hash }
    ]) {
      const rootsWithDirectEntry = refs(...direct.rootReferences, reference);
      expect(() => projectEvidenceArchive(
        direct.store.objectMap(),
        rootsWithDirectEntry,
        { mode: 'core', rootReferences: rootsWithDirectEntry }
      )).toThrow(/cannot directly include/);
    }

    for (const kind of ['raw-chunk', 'dictionary'] as const) {
      const orphan = createCoreGraph();
      orphan.store.putObject(kind, { fixture: 'rehashed-orphan' });
      expect(() => projectEvidenceArchive(orphan.store.objectMap(), orphan.rootReferences, orphan.rootProjection)).toThrow(/orphan object/);
    }

    const undeclaredDictionaryEdge = createCoreGraph({
      rawChunkBody: (dictionaryReference) => ({ dictionaryReference })
    });
    expect(() => projectEvidenceArchive(
      undeclaredDictionaryEdge.store.objectMap(),
      undeclaredDictionaryEdge.rootReferences,
      undeclaredDictionaryEdge.rootProjection
    )).toThrow(/raw-chunk .*undeclared typed reference/);

    for (const kind of ['run', 'aggregate', 'comparison', 'qualification'] as const) {
      const graph = createMultiplyOwnedUniqueGraph(kind);
      expect(() => projectEvidenceArchive(graph.store.objectMap(), graph.rootReferences, graph.rootProjection)).toThrow(/must have one logical owner/);
    }
  });

  it('recomputes dedup statistics from the typed graph and fingerprints deterministic compressor behavior', async () => {
    const { store, rootReferences, rootProjection } = createCoreGraph();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-dedup-'));
    roots.push(root);
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const written = await writeEvidenceArchive({
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    for (const field of [
      'logicalReferenceCount',
      'uniqueObjectCount',
      'logicalCanonicalBodyBytes',
      'uniqueCanonicalBodyBytes',
      'savedObjectOccurrences',
      'savedCanonicalBodyBytes'
    ]) {
      const records = written.canonicalJsonl.toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
      records[0].dedupStatistics[field] += 1;
      const mutated = Buffer.from(`${records.map((record) => stableStringify(record)).join('\n')}\n`, 'utf8');
      const encoded = await encodeCanonicalEvidenceArchive(mutated, { compressorIdentity: identity });
      const tamperedPath = path.join(root, `dedup-statistic-${field}-mutated.jsonl.gz`);
      fs.writeFileSync(tamperedPath, encoded.gzip, { flag: 'wx', mode: 0o600 });
      await expect(readEvidenceArchive(tamperedPath, { rootProjection })).rejects.toThrow(/archive index does not match the graph projection/);
    }

    const corpus = [Buffer.from('compressor-probe'), Buffer.alloc(65536, 0x61)];
    const firstProbe = await computeCompressorProbeFingerprint({ corpus });
    const secondProbe = await computeCompressorProbeFingerprint({ corpus: corpus.map((entry) => Buffer.from(entry)) });
    const changedCorpusProbe = await computeCompressorProbeFingerprint({ corpus: [Buffer.from('compressor-probe!'), Buffer.alloc(65536, 0x61)] });
    expect(secondProbe).toBe(firstProbe);
    expect(changedCorpusProbe).not.toBe(firstProbe);
    await expect(computeCompressorProbeFingerprint({ corpus, settings: { level: 0 } as never })).rejects.toThrow(/closed compressor configuration/);
  });

  it('enforces semantic root modes and streams decompression within hard caps', async () => {
    const rootReferences = refs(
      { kind: 'singleton-report', hash: '1'.repeat(64) },
      { kind: 'singleton-report', hash: '2'.repeat(64) },
      { kind: 'singleton-report', hash: '3'.repeat(64) },
      { kind: 'singleton-report', hash: '4'.repeat(64) },
      { kind: 'package-report', hash: '5'.repeat(64) },
      { kind: 'ci-experiment-parent', hash: '6'.repeat(64) }
    );
    const rootProjection = { mode: 'core', rootReferences } as const;
    expect(validateArchiveRootMode(rootReferences, rootProjection)).toEqual(rootReferences);
    expect(() => validateArchiveRootMode(refs(...rootReferences, { kind: 'reference-experiment-parent', hash: '7'.repeat(64) }), rootProjection)).toThrow(/do not match/);
    expect(() => validateArchiveRootMode(rootReferences, { mode: 'core' } as never)).toThrow(/missing key rootReferences/);
    expect(frameCanonicalInput(Buffer.alloc(65537)).map((frame) => frame.length)).toEqual([65536, 1]);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-stream-'));
    roots.push(root);
    const bomb = path.join(root, 'bomb.jsonl.gz');
    const compressed = await encodeCanonicalEvidenceArchive(Buffer.alloc(4096, 0x61), {
      compressorProbePolicyHash: 'a'.repeat(64)
    });
    fs.writeFileSync(bomb, compressed.gzip);
    await expect(readEvidenceArchive(bomb, {
      limits: {
        maxRootBytes: 131072,
        maxCompressedBytes: 16777216,
        maxExpandedJsonlBytes: 128,
        maxRecordBytes: 8388608,
        maxTotalRecords: 65536,
        maxIndexedObjects: 65535
      },
      rootProjection
    })).rejects.toThrow(/expanded archive exceeds/);
  });

  it('enforces indexed-object caps independently of total-record caps during replay', async () => {
    const exactCap = createCoreGraph();
    const capPlusOne = createCoreGraph({ extraDictionaries: 1 });
    expect(capPlusOne.store.size()).toBe(exactCap.store.size() + 1);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-indexed-object-cap-'));
    roots.push(root);
    const exactPath = path.join(root, 'exact-cap.jsonl.gz');
    const capPlusOnePath = path.join(root, 'cap-plus-one.jsonl.gz');
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const exactWritten = await writeEvidenceArchive({
      outputPath: exactPath,
      objects: exactCap.store.objectMap(),
      rootReferences: exactCap.rootReferences,
      rootProjection: exactCap.rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const capPlusOneWritten = await writeEvidenceArchive({
      outputPath: capPlusOnePath,
      objects: capPlusOne.store.objectMap(),
      rootReferences: capPlusOne.rootReferences,
      rootProjection: capPlusOne.rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const limits = {
      ...EVIDENCE_HARD_LIMITS,
      maxIndexedObjects: exactWritten.objectCount,
      maxTotalRecords: capPlusOneWritten.recordCount
    };
    expect(capPlusOneWritten.recordCount).toBe(exactWritten.recordCount + 1);
    await expect(readEvidenceArchive(exactPath, {
      rootProjection: exactCap.rootProjection,
      limits
    })).resolves.toMatchObject({
      objectCount: exactWritten.objectCount,
      recordCount: exactWritten.recordCount
    });
    await expect(readEvidenceArchive(capPlusOnePath, {
      rootProjection: capPlusOne.rootProjection,
      limits
    })).rejects.toThrow(/archive index exceeds the indexed-object hard limit/);

    const records = zlib.gunzipSync(fs.readFileSync(capPlusOnePath)).toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
    records[0].indexedHashes = records[0].indexedHashes.slice(0, -1);
    const mismatchedIndexArchive = await encodeCanonicalEvidenceArchive(
      Buffer.from(`${records.map((record) => stableStringify(record)).join('\n')}\n`, 'utf8'),
      { compressorIdentity: identity }
    );
    const mismatchedIndexPath = path.join(root, 'mismatched-index.jsonl.gz');
    fs.writeFileSync(mismatchedIndexPath, mismatchedIndexArchive.gzip);
    await expect(readEvidenceArchive(mismatchedIndexPath, {
      rootProjection: capPlusOne.rootProjection,
      limits
    })).rejects.toThrow(/archive exceeds the indexed-object hard limit/);
    const coupledLimits = { ...limits, maxTotalRecords: exactWritten.recordCount };
    await expect(readEvidenceArchive(mismatchedIndexPath, {
      rootProjection: capPlusOne.rootProjection,
      limits: coupledLimits
    })).rejects.toThrow(/archive exceeds the indexed-object hard limit/);

    const totalOverflowRecords = zlib.gunzipSync(fs.readFileSync(exactPath)).toString('utf8').trimEnd().split('\n').map((line) => JSON.parse(line));
    totalOverflowRecords.push({ recordType: 'not-an-object' });
    const totalOverflowArchive = await encodeCanonicalEvidenceArchive(
      Buffer.from(`${totalOverflowRecords.map((record) => stableStringify(record)).join('\n')}\n`, 'utf8'),
      { compressorIdentity: identity }
    );
    const totalOverflowPath = path.join(root, 'total-overflow.jsonl.gz');
    fs.writeFileSync(totalOverflowPath, totalOverflowArchive.gzip);
    await expect(readEvidenceArchive(totalOverflowPath, {
      rootProjection: exactCap.rootProjection,
      limits: coupledLimits
    })).rejects.toThrow(/archive exceeds the total-record hard limit/);
  });

  it('rejects replay bypasses, noncanonical members, and ignored typed back-edges', async () => {
    const { store, rootReferences, rootProjection, child } = createCoreGraph();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-evidence-replay-'));
    roots.push(root);
    const output = path.join(root, 'evidence.jsonl.gz');
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const written = await writeEvidenceArchive({
      outputPath: output,
      objects: store.objectMap(),
      rootReferences,
      rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    await expect(readEvidenceArchive(output, { rootProjection, limits: { maxRootBytes: 1 } as never })).rejects.toThrow(/missing key/);
    await expect(readEvidenceArchive(output, {
      rootProjection,
      limits: { maxRootBytes: 131072, maxCompressedBytes: 16777217, maxExpandedJsonlBytes: 134217728, maxRecordBytes: 8388608, maxTotalRecords: 65536, maxIndexedObjects: 65535 }
    })).rejects.toThrow(/relaxes the V1 hard cap/);
    const bytes = fs.readFileSync(output);
    fs.writeFileSync(path.join(root, 'concatenated.gz'), Buffer.concat([bytes, bytes]));
    await expect(readEvidenceArchive(path.join(root, 'concatenated.gz'), { rootProjection })).rejects.toThrow(/exactly one member/);
    const invalidHeader = Buffer.from(bytes);
    invalidHeader[8] = 0;
    fs.writeFileSync(path.join(root, 'invalid-header.gz'), invalidHeader);
    await expect(readEvidenceArchive(path.join(root, 'invalid-header.gz'), { rootProjection })).rejects.toThrow(/canonical V1 header/);
    const invalidTrailer = Buffer.from(bytes);
    invalidTrailer[invalidTrailer.length - 8] ^= 1;
    fs.writeFileSync(path.join(root, 'invalid-trailer.gz'), invalidTrailer);
    await expect(readEvidenceArchive(path.join(root, 'invalid-trailer.gz'), { rootProjection })).rejects.toThrow(/trailer checksum or size/);
    fs.writeFileSync(path.join(root, 'trailing.gz'), Buffer.concat([bytes, Buffer.from([1]) ]));
    await expect(readEvidenceArchive(path.join(root, 'trailing.gz'), { rootProjection })).rejects.toThrow(/exactly one member|cannot be decoded/);
    const tampered = store.objectMap();
    const originalParentHash = rootReferences.find((reference) => reference.kind === 'ci-experiment-parent')!.hash;
    const childBody = tampered.get(child.hash)!;
    childBody.body.parentReference = { kind: 'ci-experiment-parent', hash: originalParentHash };
    const originalChildHash = childBody.hash;
    childBody.canonicalBodyBytes = Buffer.byteLength(stableStringify(childBody.body), 'utf8');
    childBody.hash = canonicalSha256({ kind: childBody.kind, body: childBody.body });
    tampered.delete(originalChildHash);
    tampered.set(childBody.hash, childBody);
    const parentBody = tampered.get(originalParentHash)!;
    parentBody.body.childManifest.hash = childBody.hash;
    parentBody.canonicalBodyBytes = Buffer.byteLength(stableStringify(parentBody.body), 'utf8');
    parentBody.hash = canonicalSha256({ kind: parentBody.kind, body: parentBody.body });
    tampered.delete(originalParentHash);
    tampered.set(parentBody.hash, parentBody);
    const tamperedRoots = refs(...rootReferences.filter((reference) => reference.hash !== originalParentHash), { kind: parentBody.kind, hash: parentBody.hash });
    const tamperedProjection = { mode: 'core', rootReferences: tamperedRoots } as const;
    await expect(Promise.resolve().then(() => writeEvidenceArchive({
      objects: tampered,
      rootReferences: tamperedRoots,
      rootProjection: tamperedProjection,
      rootBytes: 1,
      compressorIdentity: identity
    }))).rejects.toThrow(/undeclared typed reference/);
    expect(written.compressedArchiveSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
