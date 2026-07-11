import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalSha256, stableStringify } from '../../../scripts/lib/baseline-report.js';
import {
  createCompressorIdentity,
  createEvidenceStore,
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

function createCoreGraph() {
  const store = createEvidenceStore();
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const singleton = store.putObject('singleton-report', { evidenceId });
    return { kind: singleton.kind, hash: singleton.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:test:release' });
  const chunk = store.putObject('raw-chunk', { values: [1] });
  const dictionary = store.putObject('dictionary', { values: ['one'] });
  const rawManifest = store.putObject('raw-kind-manifest', {
    chunkReferences: refs({ kind: chunk.kind, hash: chunk.hash }),
    dictionaryReferences: refs({ kind: dictionary.kind, hash: dictionary.hash })
  });
  const child = store.putObject('experiment-child-manifest', {
    rawKindManifestReferences: refs({ kind: rawManifest.kind, hash: rawManifest.hash })
  });
  const parent = store.putObject('ci-experiment-parent', { childManifest: { kind: child.kind, hash: child.hash } });
  const rootReferences = refs(...singletonReferences, { kind: packageReport.kind, hash: packageReport.hash }, { kind: parent.kind, hash: parent.hash });
  return { store, rootReferences, rootProjection: { mode: 'core', rootReferences }, child };
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
    const noncanonicalEntryArchive = zlib.gzipSync(Buffer.from(`${records.map((record) => stableStringify(record)).join('\n')}\n`, 'utf8'));
    Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff]).copy(noncanonicalEntryArchive, 0);
    const corruptedOutput = path.join(root, 'conflicting-entry.jsonl.gz');
    fs.writeFileSync(corruptedOutput, noncanonicalEntryArchive);
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
    const compressed = zlib.gzipSync(Buffer.alloc(4096, 0x61));
    Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff]).copy(compressed, 0);
    fs.writeFileSync(bomb, compressed);
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
