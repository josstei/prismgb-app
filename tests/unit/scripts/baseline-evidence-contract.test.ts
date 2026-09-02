import { describe, expect, it } from 'vitest';
import { canonicalSha256 } from '../../../scripts/lib/baseline-report.js';
import {
  assertCompressorIdentityMatches,
  createAcceptedEvidenceBody,
  createAcceptedRootBody,
  createCoreCandidateBody,
  createCoreEvidenceBody,
  createCoreEvidenceRecord,
  createResolvedCandidateBody,
  createResolvedEvidenceBody,
  createResolvedEvidenceRecord,
  validateAcceptedEvidenceBody,
  validateAcceptedRootBody,
  validateCoreCandidateBody,
  validateCoreEvidenceBody,
  validateResolvedCandidateBody,
  validateResolvedEvidenceBody,
  validateRootProjection
} from '../../../scripts/lib/baseline-evidence-contract.js';

const sourceSha = '9a7839ce47c61982f6eab836c496b8469f01a9ca';
const analysisSha256 = '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba';

const baseCompressorIdentity = {
  codec: 'node:zlib.gzip',
  nodeVersion: 'v25.0.0',
  zlibVersion: '1.3.0',
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
  compressorProbePolicyHash: 'b'.repeat(64),
  compressorProbeSha256: 'c'.repeat(64)
};

function references(...entries: { kind: string; hash: string }[]) {
  return [...entries].sort((left, right) => {
    const leftKey = `${left.kind}:${left.hash}`;
    const rightKey = `${right.kind}:${right.hash}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function compressorIdentity(overrides: Partial<typeof baseCompressorIdentity> = {}) {
  return { ...baseCompressorIdentity, ...overrides };
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

function selectedReferences(core = coreReferences()) {
  return references(...core, { kind: 'reference-experiment-parent', hash: '7'.repeat(64) });
}

function acceptedSelectedReferences(resolved = selectedReferences()) {
  return references(...resolved, { kind: 'decision-evidence', hash: '8'.repeat(64) });
}

function noHostReferences(core = coreReferences()) {
  return references(...core, { kind: 'no-host-blocker', hash: '9'.repeat(64) });
}

function acceptedNoHostReferences(resolved = noHostReferences()) {
  return references(...resolved, { kind: 'decision-evidence', hash: '8'.repeat(64) });
}

function dedupStatistics(logicalReferenceCount = 2, uniqueObjectCount = 2, logicalCanonicalBodyBytes = 2, uniqueCanonicalBodyBytes = 2) {
  return {
    logicalReferenceCount,
    uniqueObjectCount,
    logicalCanonicalBodyBytes,
    uniqueCanonicalBodyBytes,
    savedObjectOccurrences: logicalReferenceCount - uniqueObjectCount,
    savedCanonicalBodyBytes: logicalCanonicalBodyBytes - uniqueCanonicalBodyBytes
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
    dedupStatistics: dedupStatistics(1, 1, 1, 1),
    workflowProvenance: {
      captureIdentity: {
        provider: 'github-actions',
        sourceSha,
        analysisSha256,
        repository: 'prismgb/prismgb-app',
        workflowRef: 'prismgb/prismgb-app/.github/workflows/codebase-baseline.yml@refs/heads/main',
        workflowRunId: '1',
        workflowRunAttempt: 1,
        eventName: 'workflow_dispatch'
      },
      producers: [{ jobId: 'validate-linux', targetId: null, artifactName: 'singleton' }]
    }
  };
}

function resolvedBody(core: ReturnType<typeof createCoreEvidenceRecord>, mode: 'selected-reference' | 'no-reference-host' = 'selected-reference') {
  const rootReferences = mode === 'selected-reference'
    ? selectedReferences(core.coreEvidenceBody.rootReferences)
    : noHostReferences(core.coreEvidenceBody.rootReferences);
  return {
    ...core,
    resolutionMode: mode,
    status: 'complete',
    rootReferences,
    canonicalArchiveSha256: '0'.repeat(64),
    objectIndexSha256: 'a'.repeat(64),
    expandedJsonlBytes: 20,
    objectCount: 2,
    recordCount: 3,
    dedupStatistics: dedupStatistics(),
    resolution: mode === 'selected-reference'
      ? { mode: 'selected-reference', host: 'reference-host-1' }
      : { mode: 'no-host-selected' }
  };
}

function acceptedBody(acceptedEvidence: ReturnType<typeof createAcceptedEvidenceBody>) {
  const { acceptedEvidenceChecksum: ignored, ...body } = acceptedEvidence;
  return body;
}

function buildSelectedPreimages({
  identity = compressorIdentity(),
  compressedArchiveSha256 = '1'.repeat(64),
  compressedBytes = 101
}: Partial<{ identity: ReturnType<typeof compressorIdentity>; compressedArchiveSha256: string; compressedBytes: number }> = {}) {
  const coreEvidenceBody = createCoreEvidenceBody(coreBody());
  const core = createCoreEvidenceRecord({ coreEvidenceBody });
  const coreCandidate = createCoreCandidateBody({
    ...core,
    compressedArchiveSha256,
    compressedBytes,
    compressorIdentity: identity
  });
  const resolvedEvidenceBody = createResolvedEvidenceBody(resolvedBody(core));
  const resolved = createResolvedEvidenceRecord({ resolvedEvidenceBody });
  const resolvedCandidate = createResolvedCandidateBody({
    ...resolved,
    coreCandidateChecksum: coreCandidate.coreCandidateChecksum,
    compressedArchiveSha256: '2'.repeat(64),
    compressedBytes: compressedBytes + 1,
    compressorIdentity: identity
  });
  const decision = { option: 'unresolved', strategy: 'unresolved', blocked: true };
  const acceptedEvidence = createAcceptedEvidenceBody({
    ...resolved,
    decision,
    decisionChecksum: canonicalSha256(decision),
    rootReferences: acceptedSelectedReferences(resolvedEvidenceBody.rootReferences)
  });
  const acceptedRoot = createAcceptedRootBody({
    acceptedEvidenceBody: acceptedBody(acceptedEvidence),
    acceptedEvidenceChecksum: acceptedEvidence.acceptedEvidenceChecksum,
    compressedArchiveSha256: '3'.repeat(64),
    compressedBytes: compressedBytes + 2,
    compressorIdentity: identity
  });
  return {
    coreEvidenceBody,
    core,
    coreCandidate,
    resolvedEvidenceBody,
    resolved,
    resolvedCandidate,
    decision,
    acceptedEvidence,
    acceptedRoot
  };
}

function replaceReferenceHash(referencesToReplace: { kind: string; hash: string }[], kind: string, fromHash: string, toHash: string) {
  return references(...referencesToReplace.map((reference) => (
    reference.kind === kind && reference.hash === fromHash ? { ...reference, hash: toHash } : reference
  )));
}

describe('baseline evidence semantic and transport contracts', () => {
  it('exports distinct closed validators for every semantic and transport preimage', () => {
    const preimages = buildSelectedPreimages();

    expect(validateCoreEvidenceBody).not.toBe(createCoreEvidenceBody);
    expect(validateCoreCandidateBody).not.toBe(createCoreCandidateBody);
    expect(validateResolvedEvidenceBody).not.toBe(createResolvedEvidenceBody);
    expect(validateResolvedCandidateBody).not.toBe(createResolvedCandidateBody);
    expect(validateAcceptedEvidenceBody).not.toBe(createAcceptedEvidenceBody);
    expect(validateAcceptedRootBody).not.toBe(createAcceptedRootBody);

    expect(validateCoreEvidenceBody(preimages.coreEvidenceBody)).toEqual(preimages.coreEvidenceBody);
    expect(validateCoreCandidateBody(preimages.coreCandidate)).toEqual(preimages.coreCandidate);
    expect(validateResolvedEvidenceBody(preimages.resolvedEvidenceBody)).toEqual(preimages.resolvedEvidenceBody);
    expect(validateResolvedCandidateBody(preimages.resolvedCandidate)).toEqual(preimages.resolvedCandidate);
    expect(validateAcceptedEvidenceBody(preimages.acceptedEvidence)).toEqual(preimages.acceptedEvidence);
    expect(validateAcceptedRootBody(preimages.acceptedRoot)).toEqual(preimages.acceptedRoot);
  });

  it('has known-answer checksums for every semantic and transport preimage', () => {
    const preimages = buildSelectedPreimages();

    expect({
      coreEvidence: preimages.core.coreEvidenceChecksum,
      coreCandidate: preimages.coreCandidate.coreCandidateChecksum,
      resolvedEvidence: preimages.resolved.resolvedEvidenceChecksum,
      resolvedCandidate: preimages.resolvedCandidate.resolvedCandidateChecksum,
      acceptedEvidence: preimages.acceptedEvidence.acceptedEvidenceChecksum,
      acceptedRoot: preimages.acceptedRoot.acceptedRootChecksum
    }).toEqual({
      coreEvidence: 'd37866bb291eec98b399d0240624d9e390a430c626b87b500d76d8688d277c34',
      coreCandidate: '49f56d1f3187a2a4d0aac1b78d8000bf6b6545d0e597300e0c4611704d21353f',
      resolvedEvidence: '671bda432fb74531bd7faa67f174c0b4082f0e81a7eb58839221d3f20eee21a5',
      resolvedCandidate: '548b91fe07675866257b667212421b15b5b6e5c9a5a02d6f051c6a078085b078',
      acceptedEvidence: 'e7d6c3d62e3ccb814c8069186a68b9df13d8ee0251f5abe5dee203ee99f5fe96',
      acceptedRoot: 'd555781d26dfe33c7309eac7590a751b500f7b830fd95015a8005e3d3f6b8166'
    });

    expect(canonicalSha256(preimages.coreEvidenceBody)).toBe(preimages.core.coreEvidenceChecksum);
    expect(canonicalSha256(preimages.resolvedEvidenceBody)).toBe(preimages.resolved.resolvedEvidenceChecksum);
  });

  it('permits compressor fields only in the three transport preimages', () => {
    const preimages = buildSelectedPreimages();
    const transport = {
      compressedArchiveSha256: 'd'.repeat(64),
      compressedBytes: 104,
      compressorIdentity: compressorIdentity()
    };

    expect(() => createCoreEvidenceBody({ ...preimages.coreEvidenceBody, ...transport })).toThrow(/unknown key compressedArchiveSha256/);
    expect(() => createResolvedEvidenceBody({ ...preimages.resolvedEvidenceBody, ...transport })).toThrow(/unknown key compressedArchiveSha256/);
    expect(() => createAcceptedEvidenceBody({
      ...acceptedBody(preimages.acceptedEvidence),
      ...transport
    })).toThrow(/unknown key compressedArchiveSha256/);

    expect(() => createCoreCandidateBody({ ...preimages.coreCandidate, resolution: { mode: 'selected-reference' } })).toThrow(/unknown key resolution/);
    expect(() => createResolvedCandidateBody({ ...preimages.resolvedCandidate, decision: preimages.decision })).toThrow(/unknown key decision/);
    expect(() => createAcceptedRootBody({ ...preimages.acceptedRoot, rootReferences: preimages.acceptedEvidence.rootReferences })).toThrow(/unknown key rootReferences/);
  });

  it('requires each nested root projection to be byte-for-byte retained by its enclosing preimage', () => {
    const preimages = buildSelectedPreimages();
    const alteredResolvedReferences = replaceReferenceHash(
      preimages.resolvedEvidenceBody.rootReferences,
      'package-report',
      '5'.repeat(64),
      'f'.repeat(64)
    );

    expect(() => createResolvedEvidenceBody({
      ...preimages.resolvedEvidenceBody,
      rootReferences: alteredResolvedReferences
    })).toThrow(/must retain every nested root reference/);

    const noHostCore = createCoreEvidenceRecord({ coreEvidenceBody: coreBody() });
    const noHostResolved = createResolvedEvidenceRecord({
      resolvedEvidenceBody: createResolvedEvidenceBody(resolvedBody(noHostCore, 'no-reference-host'))
    });
    expect(() => createAcceptedEvidenceBody({
      ...noHostResolved,
      decision: preimages.decision,
      decisionChecksum: canonicalSha256(preimages.decision),
      rootReferences: acceptedSelectedReferences()
    })).toThrow(/accepted no-reference-host projection/);
  });

  it('rejects a nested semantic mutation even after every enclosing checksum is recomputed', () => {
    const preimages = buildSelectedPreimages();
    const mutatedCoreEvidenceBody = {
      ...preimages.coreEvidenceBody,
      rootReferences: replaceReferenceHash(
        preimages.coreEvidenceBody.rootReferences,
        'package-report',
        '5'.repeat(64),
        'e'.repeat(64)
      )
    };
    const mutatedCoreEvidenceChecksum = canonicalSha256(mutatedCoreEvidenceBody);
    const forgedResolvedEvidenceBody = {
      ...preimages.resolvedEvidenceBody,
      coreEvidenceBody: mutatedCoreEvidenceBody,
      coreEvidenceChecksum: mutatedCoreEvidenceChecksum
    };
    const forgedResolvedEvidenceChecksum = canonicalSha256(forgedResolvedEvidenceBody);
    const forgedAcceptedEvidenceBody = {
      ...acceptedBody(preimages.acceptedEvidence),
      resolvedEvidenceBody: forgedResolvedEvidenceBody,
      resolvedEvidenceChecksum: forgedResolvedEvidenceChecksum
    };
    const forgedAcceptedEvidenceChecksum = canonicalSha256(forgedAcceptedEvidenceBody);
    const forgedAcceptedRootBody = {
      acceptedEvidenceBody: forgedAcceptedEvidenceBody,
      acceptedEvidenceChecksum: forgedAcceptedEvidenceChecksum,
      compressedArchiveSha256: preimages.acceptedRoot.compressedArchiveSha256,
      compressedBytes: preimages.acceptedRoot.compressedBytes,
      compressorIdentity: preimages.acceptedRoot.compressorIdentity
    };

    expect(canonicalSha256(forgedAcceptedRootBody)).not.toBe(preimages.acceptedRoot.acceptedRootChecksum);
    expect(() => createAcceptedRootBody({
      ...forgedAcceptedRootBody,
      acceptedRootChecksum: canonicalSha256(forgedAcceptedRootBody)
    })).toThrow(/must retain every nested root reference/);
  });

  it('keeps semantic preimages stable while supported compressor identities change transport preimages', () => {
    const first = buildSelectedPreimages();
    const second = buildSelectedPreimages({
      identity: compressorIdentity({
        nodeVersion: 'v26.0.0',
        zlibVersion: '1.4.0',
        compressorProbePolicyHash: 'e'.repeat(64),
        compressorProbeSha256: 'f'.repeat(64)
      }),
      compressedArchiveSha256: '4'.repeat(64),
      compressedBytes: 201
    });

    expect(second.coreEvidenceBody).toEqual(first.coreEvidenceBody);
    expect(second.core.coreEvidenceChecksum).toBe(first.core.coreEvidenceChecksum);
    expect(second.resolvedEvidenceBody).toEqual(first.resolvedEvidenceBody);
    expect(second.resolved.resolvedEvidenceChecksum).toBe(first.resolved.resolvedEvidenceChecksum);
    expect(second.acceptedEvidence).toEqual(first.acceptedEvidence);
    expect(second.acceptedEvidence.acceptedEvidenceChecksum).toBe(first.acceptedEvidence.acceptedEvidenceChecksum);

    expect(second.coreCandidate.coreCandidateChecksum).not.toBe(first.coreCandidate.coreCandidateChecksum);
    expect(second.resolvedCandidate.resolvedCandidateChecksum).not.toBe(first.resolvedCandidate.resolvedCandidateChecksum);
    expect(second.acceptedRoot.acceptedRootChecksum).not.toBe(first.acceptedRoot.acceptedRootChecksum);
  });

  it('requires transport identity assertions to match the codec-derived identity exactly', () => {
    const actual = compressorIdentity();
    expect(assertCompressorIdentityMatches(actual, actual)).toEqual(actual);
    expect(() => assertCompressorIdentityMatches(actual, {
      ...actual,
      compressorProbeSha256: 'd'.repeat(64)
    })).toThrow(/actual production encoder identity/);
  });

  it('binds workflow provenance to the core source identity and rejects an embedded producer', () => {
    const body = coreBody();
    expect(() => createCoreEvidenceRecord({
      coreEvidenceBody: {
        ...body,
        workflowProvenance: {
          ...body.workflowProvenance,
          captureIdentity: { ...body.workflowProvenance.captureIdentity, sourceSha: 'b'.repeat(40) }
        }
      }
    })).toThrow(/sourceSha must match coreEvidenceBody.sourceSha/);
    expect(() => createCoreEvidenceRecord({
      coreEvidenceBody: {
        ...body,
        workflowProvenance: {
          ...body.workflowProvenance,
          captureIdentity: { ...body.workflowProvenance.captureIdentity, analysisSha256: 'b'.repeat(64) }
        }
      }
    })).toThrow(/analysisSha256 must match coreEvidenceBody.analysisSha256/);
    expect(() => createCoreEvidenceRecord({
      coreEvidenceBody: {
        ...body,
        workflowProvenance: {
          ...body.workflowProvenance,
          captureIdentity: {
            ...body.workflowProvenance.captureIdentity,
            producer: { jobId: 'not-permitted', targetId: null, artifactName: 'not-permitted' }
          }
        }
      }
    })).toThrow(/unknown key producer/);
  });

  it('retains no-host and selected root projection closure', () => {
    const core = coreReferences();
    const selected = selectedReferences(core);
    expect(validateRootProjection(selected, 'selected-reference', { coreReferences: core })).toEqual(selected);
    expect(() => validateRootProjection(selected, 'selected-reference', {
      coreReferences: core.filter((reference) => reference.kind !== 'package-report')
    })).toThrow(/package report/);

    const acceptedSelected = acceptedSelectedReferences(selected);
    expect(validateRootProjection(acceptedSelected, 'accepted-selected-reference', {
      coreReferences: core,
      resolvedReferences: selected
    })).toEqual(acceptedSelected);

    const noHost = noHostReferences(core);
    const acceptedNoHost = acceptedNoHostReferences(noHost);
    expect(validateRootProjection(acceptedNoHost, 'accepted-no-reference-host', {
      coreReferences: core,
      resolvedReferences: noHost
    })).toEqual(acceptedNoHost);
  });
});
