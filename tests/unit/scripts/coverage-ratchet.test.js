import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  evaluateCoverageRatchet,
  ensureIsoDate,
  parseArgs,
  readCoverageThresholds
} from '../../../scripts/coverage-ratchet.js';

const temporaryRoots = [];

function createTempRoot(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  temporaryRoots.push(root);
  return root;
}

function writeJson(root, filename, content) {
  const fullPath = path.join(root, filename);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(content, null, 2)}\n`);
  return fullPath;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('coverage-ratchet cli args', () => {
  it('parses explicit summary and threshold paths', () => {
    expect(
      parseArgs([
        '--summary',
        'artifacts/custom/summary.json',
        '--thresholds',
        'scripts/ratchet.json',
        '--as-of',
        '2026-08-14',
        '--report-only'
      ])
    ).toMatchObject({
      summaryPath: 'artifacts/custom/summary.json',
      thresholdPath: 'scripts/ratchet.json',
      asOfDate: '2026-08-14',
      reportOnly: true
    });
  });

  it('rejects invalid date formats', () => {
    expect(() => ensureIsoDate('2026-13-40', 'test-date')).toThrow(
      'Expected a real calendar date'
    );
    expect(() => ensureIsoDate('08/14/2026', 'test-date')).toThrow(
      'Expected YYYY-MM-DD'
    );
  });
});

describe('coverage threshold parsing', () => {
  it('parses targets with owner, scope, and expiry metadata', () => {
    const root = createTempRoot('coverage-threshold-manifest');
    const thresholdPath = writeJson(root, 'coverage-thresholds.json', {
      version: 1,
      mode: 'enforce',
      defaultMinimums: { lines: 0 },
      targets: [
        {
          id: 'example-node',
          owner: 'platform/example',
          scope: ['src/example', 'src/example/**'],
          minimums: { lines: 10 },
          expiresOn: '2026-12-31'
        },
        {
          id: 'renderer',
          owner: 'platform/ui',
          mode: 'report-only',
          scope: 'src/renderer',
          minimums: { lines: 8 },
          expiresOn: '2026-11-30'
        }
      ]
    });

    const config = readCoverageThresholds(thresholdPath);
    expect(config.mode).toBe('enforce');
    expect(config.targets.map((target) => target.id)).toEqual(['example-node', 'renderer']);
    expect(config.targets[0].scopes).toContain('src/example');
    expect(config.targets[1].owner).toBe('platform/ui');
    expect(config.targets[1].mode).toBe('report-only');
    expect(config.targets[1].minimums).toMatchObject({ lines: 8 });
    expect(config.targets[0].expiresOn).toBe('2026-12-31');
  });
});

describe('coverage threshold evaluation', () => {
  it('passes when all configured minimums are satisfied', () => {
    const summary = {
      'src/example/model.ts': {
        lines: { total: 20, covered: 18, skipped: 0, pct: 90 },
        statements: { total: 30, covered: 28, skipped: 0, pct: 93.333333 },
        functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
        branches: { total: 12, covered: 11, skipped: 0, pct: 91.666667 }
      },
      'src/renderer/app.ts': {
        lines: { total: 40, covered: 35, skipped: 0, pct: 87.5 },
        statements: { total: 50, covered: 45, skipped: 0, pct: 90 },
        functions: { total: 20, covered: 18, skipped: 0, pct: 90 },
        branches: { total: 30, covered: 26, skipped: 0, pct: 86.666667 }
      },
      total: { lines: 60, covered: 53, skipped: 0, pct: 88.333333 }
    };

    const thresholds = {
      mode: 'enforce',
      defaultMinimums: { lines: 0, statements: 0, functions: 0, branches: 0 },
      targets: [
        {
          id: 'example',
          owner: 'platform/example',
          scope: 'src/example',
          minimums: { lines: 80, statements: 80, functions: 80, branches: 80 },
          expiresOn: '2026-12-31'
        },
        {
          id: 'renderer',
          owner: 'platform/ui',
          scope: 'src/renderer',
          minimums: { lines: 85 },
          expiresOn: '2026-12-31'
        }
      ]
    };

    const evaluation = evaluateCoverageRatchet(summary, thresholds, {
      asOfDate: '2026-05-20'
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.failures).toHaveLength(0);
    expect(evaluation.results).toHaveLength(2);
    expect(evaluation.results.find((entry) => entry.target === 'example')).toMatchObject({
      target: 'example',
      fileCount: 1,
      passes: true
    });
    expect(evaluation.results.find((entry) => entry.target === 'renderer')).toMatchObject({
      target: 'renderer',
      fileCount: 1,
      passes: true
    });
  });

  it('fails when coverage drops below threshold or target is expired', () => {
    const summary = {
      'src/renderer/app.ts': {
        lines: { total: 40, covered: 20, skipped: 0, pct: 50 },
        statements: { total: 50, covered: 20, skipped: 0, pct: 40 },
        functions: { total: 20, covered: 8, skipped: 0, pct: 40 },
        branches: { total: 30, covered: 10, skipped: 0, pct: 33.333333 }
      },
      total: { lines: 40, covered: 20, skipped: 0, pct: 50 }
    };

    const thresholds = {
      mode: 'enforce',
      defaultMinimums: { lines: 0, statements: 0, functions: 0, branches: 0 },
      targets: [
        {
          id: 'renderer',
          owner: 'platform/ui',
          scope: 'src/renderer',
          minimums: { lines: 80, statements: 70, functions: 70, branches: 70 },
          expiresOn: '2026-04-01'
        }
      ]
    };

    const evaluation = evaluateCoverageRatchet(summary, thresholds, {
      asOfDate: '2026-05-20'
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(5);
    expect(evaluation.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'expired',
          target: 'renderer'
        }),
        expect.objectContaining({
          type: 'coverage-regression',
          metric: 'lines'
        }),
        expect.objectContaining({
          type: 'coverage-regression',
          metric: 'statements'
        }),
        expect.objectContaining({
          type: 'coverage-regression',
          metric: 'functions'
        }),
        expect.objectContaining({
          type: 'coverage-regression',
          metric: 'branches'
        })
      ])
    );
  });

  it('allows explicit report-only targets to avoid blocking on excluded coverage artifacts', () => {
    const summary = {
      total: { lines: 0, covered: 0, skipped: 0, pct: 100 }
    };

    const thresholds = {
      mode: 'enforce',
      defaultMinimums: { lines: 0, statements: 0, functions: 0, branches: 0 },
      targets: [
        {
          id: 'main-preload',
          owner: 'platform/runtime',
          mode: 'report-only',
          scope: ['src/main', 'src/preload'],
          minimums: { lines: 80, statements: 80, functions: 80, branches: 80 },
          expiresOn: '2026-12-31'
        }
      ]
    };

    const evaluation = evaluateCoverageRatchet(summary, thresholds, {
      asOfDate: '2026-05-20'
    });

    expect(evaluation.passed).toBe(true);
    expect(evaluation.failures).toHaveLength(0);
    expect(evaluation.results[0]).toMatchObject({
      target: 'main-preload',
      mode: 'report-only',
      fileCount: 0,
      passes: true
    });
  });

  it('fails enforced targets that match no files even when minimums are zero', () => {
    const summary = {
      total: { lines: 0, covered: 0, skipped: 0, pct: 100 }
    };

    const thresholds = {
      mode: 'enforce',
      defaultMinimums: { lines: 0, statements: 0, functions: 0, branches: 0 },
      targets: [
        {
          id: 'main-preload',
          owner: 'platform/runtime',
          scope: ['src/main', 'src/preload'],
          minimums: { lines: 0, statements: 0, functions: 0, branches: 0 },
          expiresOn: '2026-12-31'
        }
      ]
    };

    const evaluation = evaluateCoverageRatchet(summary, thresholds, {
      asOfDate: '2026-05-20'
    });

    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toContainEqual(
      expect.objectContaining({
        target: 'main-preload',
        type: 'missing-data'
      })
    );
  });
});
