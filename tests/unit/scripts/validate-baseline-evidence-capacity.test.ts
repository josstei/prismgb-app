import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createCompressorIdentity,
  createEvidenceStore,
  EVIDENCE_HARD_LIMITS,
  encodeEvidenceArchive
} from '../../../scripts/lib/baseline-evidence-store.js';
import {
  CAPACITY_OUTPUT_ROOT,
  assertSelectedPreviewHeadroom,
  calculateQualifiedIncompleteEnvelope,
  measureQualifiedIncompleteCompactVector,
  resolveCapacityOutputRoot,
  runCapacityCli,
  runCapacityValidation,
  writeSelectedPreviewArchive
} from '../../../scripts/validate-baseline-evidence-capacity.js';

const roots: string[] = [];

function sortReferences(references: { kind: string, hash: string }[]) {
  return [...references].sort((left, right) => {
    const leftKey = `${left.kind}:${left.hash}`;
    const rightKey = `${right.kind}:${right.hash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function legacyColumnPermutationKey(vector: number[][]) {
  return JSON.stringify(vector[0].map((_, coverageIndex) => vector
    .map((runVector) => runVector[coverageIndex])
    .sort()));
}

function createSelectedPreviewGraph(payload: string) {
  const store = createEvidenceStore();
  const singletonReferences = ['source', 'events', 'lifecycle', 'behavior'].map((evidenceId) => {
    const object = store.putObject('singleton-report', { evidenceId, fixture: 'selected-preview-gate' });
    return { kind: object.kind, hash: object.hash };
  });
  const packageReport = store.putObject('package-report', { evidenceId: 'package:selected-preview-gate:release' });
  const ciChild = store.putObject('experiment-child-manifest', { fixture: 'selected-preview-gate-ci' });
  const ciParent = store.putObject('ci-experiment-parent', {
    childManifest: { kind: ciChild.kind, hash: ciChild.hash }
  });
  const rawChunk = store.putObject('raw-chunk', { fixture: 'selected-preview-gate', payload });
  const rawManifest = store.putObject('raw-kind-manifest', {
    chunkReferences: sortReferences([{ kind: rawChunk.kind, hash: rawChunk.hash }])
  });
  const referenceChild = store.putObject('experiment-child-manifest', {
    rawKindManifestReferences: sortReferences([{ kind: rawManifest.kind, hash: rawManifest.hash }])
  });
  const referenceParent = store.putObject('reference-experiment-parent', {
    childManifest: { kind: referenceChild.kind, hash: referenceChild.hash }
  });
  const coreReferences = sortReferences([
    ...singletonReferences,
    { kind: packageReport.kind, hash: packageReport.hash },
    { kind: ciParent.kind, hash: ciParent.hash }
  ]);
  const rootReferences = sortReferences([...coreReferences, { kind: referenceParent.kind, hash: referenceParent.hash }]);
  return {
    store,
    rootReferences,
    rootProjection: { mode: 'selected-reference' as const, rootReferences, coreReferences }
  };
}

function deterministicPreviewPayload(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = 0x9e3779b9;
  let payload = '';
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    payload += alphabet[(state >>> 26) & 0x3f];
  }
  return payload;
}

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('baseline evidence capacity runner', () => {
  it('keeps the compact semantic envelope separate from full-size fixtures', async () => {
    const envelope = calculateQualifiedIncompleteEnvelope({ runCount: 2 });
    expect(envelope.coverage).toHaveLength(6);
    expect(envelope.compactPerRunVectorCount).toBe(300);
    expect(envelope.compactVectorCount).toBe(89999);
    expect(envelope.evaluatedCompactVectorCount).toBe(envelope.compactVectorCount);
    expect(Object.keys(envelope.semanticComponentMaxima)).toEqual(['maximumRecordBytes', 'expandedJsonlBytes', 'objectCount', 'recordCount']);
    const expectedMaterializedMaxima = Object.fromEntries(Object.keys(envelope.semanticComponentMaxima)
      .map((component) => [component, envelope.semanticComponentMaxima[component].value]));
    expect(envelope.materializedSemanticComponentMaxima).toEqual(expectedMaterializedMaxima);
    const independentlyPermutedLeft = [[0, 0, 0, 0, 0, 1], [0, 1, 1, 1, 1, 1]];
    const independentlyPermutedRight = [[0, 0, 0, 0, 1, 1], [0, 1, 1, 1, 0, 1]];
    expect(legacyColumnPermutationKey(independentlyPermutedLeft)).toBe(legacyColumnPermutationKey(independentlyPermutedRight));
    const leftComponents = measureQualifiedIncompleteCompactVector({ vector: independentlyPermutedLeft });
    const rightComponents = measureQualifiedIncompleteCompactVector({ vector: independentlyPermutedRight });
    expect(leftComponents.expandedJsonlBytes).toBe(15506);
    expect(rightComponents.expandedJsonlBytes).toBe(15505);
    expect(leftComponents.expandedJsonlBytes).not.toBe(rightComponents.expandedJsonlBytes);
    expect(envelope.shapes.length).toBeGreaterThanOrEqual(2);
    expect(envelope.shapes.every((shape) => shape.allocationVector.length === 2)).toBe(true);
    expect(envelope.shapes.map((shape) => shape.name)).toEqual(expect.arrayContaining(['max-observed-min-missing', 'max-missing-minimal-deficit']));
  }, 480000);

  it('rejects an encoded nonrepresentative selected preview before output', async () => {
    const graph = createSelectedPreviewGraph(deterministicPreviewPayload(131072));
    const identity = await createCompressorIdentity({ compressorProbePolicyHash: 'a'.repeat(64) });
    const probe = await encodeEvidenceArchive({
      objects: graph.store.objectMap(),
      rootReferences: graph.rootReferences,
      rootProjection: graph.rootProjection,
      rootBytes: 1,
      compressorIdentity: identity
    });
    const limits = {
      ...EVIDENCE_HARD_LIMITS,
      maxCompressedBytes: Math.ceil((probe.compressedBytes * 10) / 9)
    };
    expect(probe.compressedBytes).toBeGreaterThan(Math.floor((limits.maxCompressedBytes * 4) / 5));
    const outputRoot = path.join(CAPACITY_OUTPUT_ROOT, `preview-gate-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(outputRoot, { recursive: true });
    roots.push(outputRoot);
    const outputPath = path.join(outputRoot, 'rejected-selected-preview.jsonl.gz');
    await expect(writeSelectedPreviewArchive({
      outputPath,
      objects: graph.store.objectMap(),
      rootReferences: graph.rootReferences,
      rootProjection: graph.rootProjection,
      archiveRootBytes: 1,
      compressorIdentity: identity,
      limits,
      createPreviewRoot: (archive) => ({
        schemaVersion: 1,
        fixture: 'nonrepresentative-selected-preview',
        compressedArchiveSha256: archive.compressedArchiveSha256,
        compressedBytes: archive.compressedBytes
      })
    })).rejects.toThrow(/selected preview exceeded publication headroom: compressedBytes/);
    expect(fs.existsSync(outputPath)).toBe(false);
  }, 30000);

  it('uses contained compact workspaces and rejects output-root escape or symlink traversal', async () => {
    const limits = {
      maxRootBytes: 4096,
      maxCompressedBytes: 8192,
      maxExpandedJsonlBytes: 32768,
      maxRecordBytes: 16384,
      maxIndexedObjects: 16,
      maxTotalRecords: 17
    };
    const root = path.join(CAPACITY_OUTPUT_ROOT, `unit-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    fs.mkdirSync(root, { recursive: true });
    roots.push(root);
    const workspace = 'contained-workspace';
    const completed = await runCapacityValidation({
      mode: 'codec-boundaries',
      capacityRoot: root,
      workspaceId: workspace,
      codecOptions: { objectCount: 16, limits }
    });
    expect(completed.headroom).toBeNull();
    const codec = completed.codecBoundaries;
    expect(codec).toMatchObject({
      objectCount: 16,
      recordCount: 17,
      rawOverflowRejected: true,
      rootOverflowRejected: true,
      compressedOverflowRejected: true,
      expandedOverflowRejected: true,
      recordOverflowRejected: true,
      totalOverflowRejected: true,
      objectOverflowRejected: true,
      archiveReplayed: true,
      rootArchiveReplayed: true
    });
    expect(codec.exactHardLimitBoundaries).toEqual({
      atCap: {
        rootBytes: limits.maxRootBytes,
        compressedBytes: limits.maxCompressedBytes,
        expandedJsonlBytes: limits.maxExpandedJsonlBytes,
        maximumRecordBytes: limits.maxRecordBytes,
        objectCount: limits.maxIndexedObjects,
        recordCount: limits.maxTotalRecords
      },
      capPlusOneRejected: {
        rootBytes: true,
        compressedBytes: true,
        expandedJsonlBytes: true,
        maximumRecordBytes: true,
        objectCount: true,
        recordCount: true
      }
    });
    expect(codec.streamedArchive).toMatchObject({ objectCount: 16, recordCount: 17 });
    expect(codec.physicalFixtures).toMatchObject({
      totalRecords: { atCap: 17, capPlusOne: 18 },
      indexedObjects: { atCap: 16, capPlusOne: 17 }
    });
    expect(fs.existsSync(path.join(root, workspace))).toBe(false);
    const failedWorkspace = 'failed-workspace';
    await expect(runCapacityValidation({
      mode: 'codec-boundaries',
      capacityRoot: root,
      workspaceId: failedWorkspace,
      codecOptions: { objectCount: 0, limits }
    })).rejects.toThrow(/objectCount/);
    expect(fs.existsSync(path.join(root, failedWorkspace))).toBe(false);
    expect(() => resolveCapacityOutputRoot(path.join(os.tmpdir(), 'outside-capacity'))).toThrow(/must stay beneath/);
    const symlink = path.join(root, 'escape-link');
    fs.symlinkSync(os.tmpdir(), symlink);
    expect(() => resolveCapacityOutputRoot(symlink)).toThrow(/symlink/);
    await expect(runCapacityCli(['--output-root', path.join(os.tmpdir(), 'outside-capacity')], { stdout: { write: () => undefined } as never })).rejects.toThrow(/unknown argument/);
  }, 30000);
});
