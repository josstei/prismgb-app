import { describe, expect, it } from 'vitest';
import {
  buildPhase1DriftReport,
  createDocsFragment,
  createPreloadDeclarationPreview,
  loadManifests
} from '../../../scripts/codebase-phase1-drift-report.js';

describe('codebase phase 1 drift report', () => {
  it('passes against the current hand-maintained surfaces', () => {
    const { report } = buildPhase1DriftReport();

    expect(report.status).toBe('pass');
    expect(report.checks.map((check) => check.name)).toContain('ipc channels manifest matches channels.json');
    expect(report.checks.map((check) => check.name)).toContain('platform manifest labels match release build matrix');
    expect(
      report.checks.find((check) => check.name === 'architecture aliases cover tsconfig.base aliases')
    ).toMatchObject({
      expectedCount: 6,
      actualCount: 6
    });
  });

  it('fails when an intentional manifest mismatch is introduced', () => {
    const manifests = JSON.parse(JSON.stringify(loadManifests()));
    manifests.ipc.namespaces[0].invoke[0].channel = 'device:get-status-drifted';

    const { report } = buildPhase1DriftReport(manifests);
    const ipcCheck = report.checks.find((check) => check.name === 'ipc channels manifest matches channels.json');

    expect(report.status).toBe('fail');
    expect(ipcCheck).toMatchObject({
      status: 'fail',
      missing: ['device:get-status'],
      extra: ['device:get-status-drifted']
    });
  });

  it('generates declaration and docs fragments from report-only manifests', () => {
    const manifests = loadManifests();
    const declaration = createPreloadDeclarationPreview(manifests.ipc);
    const docs = createDocsFragment(manifests);

    expect(declaration).toContain('interface Window');
    expect(declaration).toContain('deviceAPI?:');
    expect(declaration).toContain('transcodeAPI?:');
    expect(docs).toContain('CODEBASE_PHASE1_REPORT_ONLY_MANIFESTS:START');
    expect(docs).toContain('| IPC namespaces | 8 |');
    expect(docs).toContain('| Platform targets | 5 |');
  });
});
