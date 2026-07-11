import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalSha256,
  createBaselineEnvelope,
  deriveEvidenceId,
  readBaselineReport,
  stableStringify,
  validateCaptureProvenance,
  writeBaselineReport
} from '../../../scripts/lib/baseline-report.js';

const roots: string[] = [];
const sourceSha = '9a7839ce47c61982f6eab836c496b8469f01a9ca';
const analysisSha256 = '0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba';

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});
function localCapture() {
  return {
    provider: 'local' as const,
    sourceSha,
    analysisSha256,
    captureSessionId: 'source-test-session',
    producer: { role: 'source-test', targetId: null, reportSetId: 'source-test-set' }
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  return createBaselineEnvelope({
    kind: 'source',
    generatedAt: '2026-07-11T00:00:00.000Z',
    repository: { commitSha: sourceSha, dirty: false, branch: 'main' },
    environment: { os: 'darwin', arch: 'arm64', nodeVersion: 'v25.0.0', targetId: null },
    captureProvenance: localCapture(),
    inputs: { paths: ['package.json', 'src/main.ts'], policyVersion: 1 },
    metrics: { lines: 1 },
    warnings: [],
    ...overrides
  });
}

describe('baseline report canonicalization', () => {
  it('sorts recursive object keys and hashes canonical UTF-8 JSON', () => {
    expect(stableStringify({ z: { b: 1, a: 2 }, a: [true, null] })).toBe('{"a":[true,null],"z":{"a":2,"b":1}}');
    expect(canonicalSha256({ z: 1, a: 2 })).toBe(canonicalSha256({ a: 2, z: 1 }));
    expect(() => stableStringify({ value: Number.NaN })).toThrow(/non-finite/);
  });

  it('derives composite evidence identities instead of using kind alone', () => {
    expect(deriveEvidenceId('package', { targetId: 'linux-x64', buildMode: 'release' })).toBe('package:linux-x64:release');
    expect(deriveEvidenceId('hardware-qualification', { noHostSelected: true })).toBe('hardware-qualification:no-host-selected');
    expect(() => deriveEvidenceId('performance-run', {})).toThrow(/missing experimentRole/);
  });

  it('rejects delimiter-bearing evidence identity dimensions', () => {
    expect(() => deriveEvidenceId('package', { targetId: 'linux:x64', buildMode: 'release' })).toThrow(/delimiter/);
    expect(() => deriveEvidenceId('performance-experiment', { experimentId: 'experiment:one' })).toThrow(/delimiter/);
    expect(() => deriveEvidenceId('performance-run', {
      experimentRole: 'ci-integrity',
      comparisonFingerprint: 'a'.repeat(64),
      comparisonKind: 'harness-overhead',
      backend: 'web:gpu',
      pairIndex: 1,
      buildVariant: 'production',
      attemptIndex: 1
    })).toThrow(/delimiter/);
  });

  it('rejects noncanonical input paths and extra or conflicting identity dimensions', () => {
    expect(() => envelope({ inputs: { paths: ['./src/main.ts'], policyVersion: 1 } })).toThrow(/normalized repository-relative path/);
    expect(() => envelope({ inputs: { paths: ['src//main.ts'], policyVersion: 1 } })).toThrow(/normalized repository-relative path/);
    expect(() => deriveEvidenceId('source', { unexpected: true })).toThrow(/unknown key/);
    expect(() => deriveEvidenceId('hardware-qualification', {
      noHostSelected: true,
      qualificationFingerprint: 'a'.repeat(64)
    })).toThrow(/unknown key/);
    expect(() => deriveEvidenceId('performance-run', {
      experimentRole: 'ci-integrity',
      comparisonFingerprint: 'a'.repeat(64),
      comparisonKind: 'harness-overhead',
      backend: 'unsupported',
      pairIndex: 1,
      buildVariant: 'production',
      attemptIndex: 1
    })).toThrow(/backend is invalid/);
  });

  it('accepts only the closed provider-discriminated provenance records', () => {
    expect(validateCaptureProvenance(localCapture())).toEqual(localCapture());
    expect(() => validateCaptureProvenance({ ...localCapture(), extra: true })).toThrow(/unknown key/);
    expect(() => validateCaptureProvenance({ ...localCapture(), provider: 'unknown' })).toThrow(/github-actions or local/);
  });

  it('writes atomically and rejects evidence IDs that do not match dimensions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-baseline-report-'));
    roots.push(root);
    const output = path.join(root, 'source.json');
    const report = envelope();
    writeBaselineReport(output, report);
    expect(readBaselineReport(output, 'source')).toEqual(report);
    expect(() => createBaselineEnvelope({
      ...report,
      kind: 'package',
      evidenceId: 'package:wrong:release',
      dimensions: { targetId: 'linux-x64', buildMode: 'release' }
    })).toThrow(/does not match/);
  });
});
