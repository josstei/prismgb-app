import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';
import {
  createAcceptedEvidenceBody,
  createAcceptedRootBody,
  createCoreCandidateBody,
  createCoreEvidenceRecord,
  createResolvedEvidenceRecord,
  validateRootProjection
} from '../../../scripts/lib/baseline-evidence-contract.js';

const sourceSha = '9a7839ce47c61982f6eab836c496b8469f01a9ca';
const analysisSha256 = '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba';
const hash = 'a'.repeat(64);

function references(...entries: { kind: string; hash: string }[]) {
  return entries.sort((left, right) => `${left.kind}:${left.hash}`.localeCompare(`${right.kind}:${right.hash}`));
}

function coreReferences() {
  return references(
    { kind: 'singleton-report', hash: '1'.repeat(64) },
    { kind: 'singleton-report', hash: '2'.repeat(64) },
    { kind: 'singleton-report', hash: '3'.repeat(64) },
    { kind: 'singleton-report', hash: '4'.repeat(64) },
    { kind: 'package-report', hash: '5'.repeat(64) },
    { kind: 'ci-experiment-parent', hash: '6'.repeat(64) }
  );
}

function compressorIdentity() {
  return {
    codec: 'node:zlib.gzip', nodeVersion: 'v25.0.0', zlibVersion: '1.3.0', level: 9,
    strategy: 'Z_DEFAULT_STRATEGY', windowBits: 15, memLevel: 8, inputChunkBytes: 65536,
    intermediateFlush: 'Z_NO_FLUSH', finishFlush: 'Z_FINISH', mtime: 0, filename: null, comment: null,
    osByte: 255, compressorProbePolicyHash: 'b'.repeat(64), compressorProbeSha256: 'c'.repeat(64)
  };
}

function coreBody() {
  return {
    schemaVersion: 1,
    status: 'complete',
    programOriginSha: sourceSha,
    analysisSha256,
    sourceSha,
    policyHashes: { source: 'd'.repeat(64) },
    rootReferences: coreReferences(),
    canonicalArchiveSha256: 'e'.repeat(64),
    objectIndexSha256: 'f'.repeat(64),
    expandedJsonlBytes: 10,
    objectCount: 1,
    recordCount: 2,
    dedupStatistics: {
      logicalReferenceCount: 1,
      uniqueObjectCount: 1,
      logicalCanonicalBodyBytes: 1,
      uniqueCanonicalBodyBytes: 1,
      savedObjectOccurrences: 0,
      savedCanonicalBodyBytes: 0
    },
    workflowProvenance: {
      captureIdentity: {
        provider: 'github-actions', sourceSha, analysisSha256, repository: 'prismgb/prismgb-app',
        workflowRef: 'prismgb/prismgb-app/.github/workflows/codebase-baseline.yml@refs/heads/main',
        workflowRunId: '1', workflowRunAttempt: 1, eventName: 'workflow_dispatch'
      },
      producers: [{ jobId: 'validate-linux', targetId: null, artifactName: 'singleton' }]
    }
  };
}

describe('baseline evidence semantic and transport contracts', () => {
  it('binds the core semantic record independently from its transport candidate', () => {
    const record = createCoreEvidenceRecord({ coreEvidenceBody: coreBody() });
    const candidate = createCoreCandidateBody({
      ...record,
      compressedArchiveSha256: '1'.repeat(64),
      compressedBytes: 5,
      compressorIdentity: compressorIdentity()
    });
    expect(candidate.coreEvidenceChecksum).toBe(record.coreEvidenceChecksum);
    expect(candidate.coreCandidateChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(() => createCoreCandidateBody({ ...candidate, compressedBytes: 6 })).toThrow(/coreCandidateChecksum/);
  });

  it('retains the exact verified resolved preimage in accepted evidence', () => {
    const core = createCoreEvidenceRecord({ coreEvidenceBody: coreBody() });
    const resolved = createResolvedEvidenceRecord({
      resolvedEvidenceBody: {
        ...core,
        resolutionMode: 'no-reference-host',
        status: 'complete',
        rootReferences: references(...core.coreEvidenceBody.rootReferences, { kind: 'no-host-blocker', hash }),
        canonicalArchiveSha256: core.coreEvidenceBody.canonicalArchiveSha256,
        objectIndexSha256: core.coreEvidenceBody.objectIndexSha256,
        expandedJsonlBytes: 10,
        objectCount: 1,
        recordCount: 2,
        dedupStatistics: core.coreEvidenceBody.dedupStatistics,
        resolution: { mode: 'no-host-selected' }
      }
    });
    const decision = { option: 'unresolved', strategy: 'unresolved', blocked: true };
    const accepted = createAcceptedEvidenceBody({
      ...resolved,
      decision,
      decisionChecksum: canonicalSha256(decision),
      rootReferences: references(...resolved.resolvedEvidenceBody.rootReferences, { kind: 'decision-evidence', hash: '7'.repeat(64) })
    });
    const { acceptedEvidenceChecksum, ...acceptedEvidenceBody } = accepted;
    const root = createAcceptedRootBody({
      acceptedEvidenceBody,
      acceptedEvidenceChecksum,
      compressedArchiveSha256: '2'.repeat(64),
      compressedBytes: 5,
      compressorIdentity: compressorIdentity()
    });
    expect(root.acceptedEvidenceChecksum).toBe(acceptedEvidenceChecksum);
    expect(() => createAcceptedEvidenceBody({ ...accepted, decisionChecksum: '0'.repeat(64) })).toThrow(/decisionChecksum/);
  });

  it('rejects reference, no-host, and decision roots in the core projection', () => {
    expect(() => createCoreEvidenceRecord({
      coreEvidenceBody: {
        ...coreBody(),
        rootReferences: references(...coreReferences(), { kind: 'reference-experiment-parent', hash })
      }
    })).toThrow(/core root projection/);
    expect(() => createCoreEvidenceRecord({
      coreEvidenceBody: {
        ...coreBody(),
        rootReferences: coreReferences().filter((reference) => reference.kind !== 'ci-experiment-parent')
      }
    })).toThrow(/CI experiment/);
  });

  it('requires selected and accepted root projections to retain their exact nested candidates', () => {
    const core = coreReferences();
    const selected = references(...core, { kind: 'reference-experiment-parent', hash: '8'.repeat(64) });
    expect(validateRootProjection(selected, 'selected-reference', { coreReferences: core })).toEqual(selected);
    expect(() => validateRootProjection(selected, 'selected-reference', {
      coreReferences: core.filter((reference) => reference.kind !== 'package-report')
    })).toThrow(/package report/);
    const accepted = references(...selected, { kind: 'decision-evidence', hash: '9'.repeat(64) });
    expect(validateRootProjection(accepted, 'accepted-selected-reference', {
      coreReferences: core,
      resolvedReferences: selected
    })).toEqual(accepted);
  });
});
