import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalSha256, stableStringify } from '../../../scripts/lib/baseline-report.js';
import { createPerformancePairPlan } from '../../../scripts/lib/performance-pair-plan.js';
import {
  createPerformanceRawCaptureManifest,
  readPerformanceRawCaptureManifest,
  validatePerformanceRawCaptureManifest,
  writePerformanceRawCaptureManifest
} from '../../../scripts/lib/performance-raw-capture-manifest.js';

const temporaryDirectories: string[] = [];
const sourceSha = 'a'.repeat(40);
const experimentId = '123e4567-e89b-42d3-a456-426614174010';

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'prismgb-raw-capture-manifest-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true
  })));
});

function index(schemaVersion: number, count: number) {
  const body = {
    schemaVersion,
    sourceSha,
    captures: Array.from({ length: count }, (_, entry) => ({
      checksum: `${entry.toString(16).padStart(2, '0')}${'b'.repeat(62)}`
    }))
  };
  return { ...body, checksum: canonicalSha256(body) };
}

function fixture() {
  let session = 0;
  const pairPlan = createPerformancePairPlan({
    experimentId,
    backend: 'canvas2d',
    createSessionId: () => `session-${++session}`
  });
  const buildManifest = {
    schemaVersion: 1,
    sourceSha,
    variants: [
      { id: 'production', harness: false, instrumentation: false, bundle: { sha256: 'c'.repeat(64) } },
      { id: 'harness-control', harness: true, instrumentation: false, bundle: { sha256: 'd'.repeat(64) } },
      { id: 'instrumented', harness: true, instrumentation: true, bundle: { sha256: 'e'.repeat(64) } }
    ]
  };
  const productionBundleEvidence = {
    schemaVersion: 1,
    sourceSha,
    checksum: 'f'.repeat(64)
  };
  const indexes = {
    sentinel: { relativePath: 'performance-sentinel-captures.json', index: index(3, 6) },
    externalMetric: { relativePath: 'performance-external-metric-captures.json', index: index(3, 18) },
    workload: { relativePath: 'performance-workload-captures.json', index: index(5, 12) },
    metricSession: { relativePath: 'performance-metric-session-captures.json', index: index(1, 9) }
  };
  return {
    sourceSha,
    role: 'ci-integrity',
    selectedHost: false,
    experimentId,
    experimentDeadlineSeconds: 10_800,
    experimentElapsedSeconds: 42.5,
    pairPlan,
    pairPlanRelativePath: 'performance-pair-plan.json',
    buildManifest,
    buildManifestRelativePath: 'performance-build-manifest.json',
    productionBundleEvidence,
    productionBundleEvidenceRelativePath: 'performance-production-bundle-evidence.json',
    indexes
  };
}

async function writeInputs(outputDirectory: string, input: ReturnType<typeof fixture>) {
  await fs.writeFile(path.join(outputDirectory, input.pairPlanRelativePath), `${stableStringify(input.pairPlan)}\n`);
  await fs.writeFile(path.join(outputDirectory, input.buildManifestRelativePath), `${stableStringify(input.buildManifest)}\n`);
  await fs.writeFile(
    path.join(outputDirectory, input.productionBundleEvidenceRelativePath),
    `${stableStringify(input.productionBundleEvidence)}\n`
  );
  await Promise.all(Object.values(input.indexes).map(({ relativePath, index: captureIndex }) => (
    fs.writeFile(path.join(outputDirectory, relativePath), `${stableStringify(captureIndex)}\n`)
  )));
}

describe('performance raw capture manifests', () => {
  it('seals and replays the exact raw pair-plan, build, and capture-index set', async () => {
    const outputDirectory = await temporaryDirectory();
    const input = fixture();
    await writeInputs(outputDirectory, input);
    const written = await writePerformanceRawCaptureManifest({ outputDirectory, ...input });

    expect(written.manifest).toMatchObject({
      schemaVersion: 1,
      sourceSha,
      role: 'ci-integrity',
      selectedHost: false,
      experiment: { id: experimentId, backend: 'canvas2d' },
      indexes: {
        sentinel: { captureCount: 6 },
        externalMetric: { captureCount: 18 },
        workload: { captureCount: 12 },
        metricSession: { captureCount: 9 }
      }
    });
    expect(validatePerformanceRawCaptureManifest(JSON.parse(JSON.stringify(written.manifest)))).toEqual(written.manifest);
    await expect(writePerformanceRawCaptureManifest({ outputDirectory, ...input })).rejects.toMatchObject({ code: 'EEXIST' });
    await expect(readPerformanceRawCaptureManifest({ outputDirectory })).resolves.toMatchObject({
      manifest: written.manifest,
      pairPlan: input.pairPlan,
      buildManifest: input.buildManifest
    });
  });

  it('rejects incompatible host state, stale index data, and tampered replay inputs', async () => {
    const input = fixture();
    expect(() => createPerformanceRawCaptureManifest({ ...input, selectedHost: true })).toThrow(/role and selected-host/);
    expect(() => createPerformanceRawCaptureManifest({ ...input, pairPlanRelativePath: 'C:\\outside.json' })).toThrow(/inside the capture output directory/);
    expect(() => createPerformanceRawCaptureManifest({
      ...input,
      indexes: {
        ...input.indexes,
        workload: {
          ...input.indexes.workload,
          index: { ...input.indexes.workload.index, sourceSha: 'b'.repeat(40) }
        }
      }
    })).toThrow(/source SHA/);
    const manifest = createPerformanceRawCaptureManifest(input);
    expect(() => validatePerformanceRawCaptureManifest({ ...manifest, checksum: '0'.repeat(64) })).toThrow(/checksum does not match/);

    const outputDirectory = await temporaryDirectory();
    await writeInputs(outputDirectory, input);
    await writePerformanceRawCaptureManifest({ outputDirectory, ...input });
    await fs.writeFile(path.join(outputDirectory, input.indexes.externalMetric.relativePath), '{}\n');
    await expect(readPerformanceRawCaptureManifest({ outputDirectory })).rejects.toThrow(/externalMetric index/);
  });
});
