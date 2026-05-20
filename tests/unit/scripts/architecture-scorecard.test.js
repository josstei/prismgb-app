import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectAnyMetrics,
  countExplicitAnyKeywords,
  evaluateThresholds,
  parseCliArgs
} from '../../../scripts/architecture-scorecard.js';

function createMetrics(overrides = {}) {
  return {
    boundaryViolationCount: 0,
    infraToPresentationImportCount: 0,
    crossProcessImportCount: 0,
    tsStrictness: {
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true
    },
    any: {
      occurrenceCount: 10,
      filesWithAnyCount: 3
    },
    topRuntimeFiles: [
      { file: 'src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts', loc: 500 }
    ],
    ...overrides
  };
}

describe('architecture-scorecard cli args', () => {
  it('parses threshold enforcement options', () => {
    const options = parseCliArgs([
      '--enforce-thresholds',
      '--thresholds',
      'custom/limits.json',
      '--summary-output',
      'artifacts/summary.md'
    ]);

    expect(options.enforceThresholds).toBe(true);
    expect(options.thresholdsPath).toBe('custom/limits.json');
    expect(options.summaryOutput).toBe('artifacts/summary.md');
  });
});

describe('architecture-scorecard explicit any metrics', () => {
  const tempRoots = [];

  afterEach(() => {
    while (tempRoots.length > 0) {
      fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
    }
  });

  it('counts TypeScript any keywords without counting comments, strings, or property names', () => {
    const source = `
      // any in a comment should not count
      const label = 'any in a string';
      Promise.any([Promise.resolve(true)]);
      type Alias = any;
      function accept(value: any): Array<any> {
        const map: Record<string, any> = {};
        return [value, map.value];
      }
    `;

    expect(countExplicitAnyKeywords(source)).toBe(4);
  });

  it('reports explicit any counts by source file', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-scorecard-any-'));
    tempRoots.push(tempRoot);
    fs.mkdirSync(path.join(tempRoot, 'renderer'), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, 'renderer', 'typed.ts'),
      'type Payload = unknown; // any comment only\n'
    );
    fs.writeFileSync(
      path.join(tempRoot, 'renderer', 'loose.ts'),
      'export function loose(value: any): any { return value; }\n'
    );

    expect(collectAnyMetrics(tempRoot)).toMatchObject({
      occurrenceCount: 2,
      filesWithAnyCount: 1,
      files: [
        {
          file: 'renderer/loose.ts',
          count: 2
        }
      ]
    });
  });
});

describe('evaluateThresholds', () => {
  it('passes when all configured limits are satisfied', () => {
    const metrics = createMetrics();
    const limits = {
      boundaryViolationCount: 0,
      infraToPresentationImportCount: 0,
      crossProcessImportCount: 0,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      anyOccurrenceCountMax: 10,
      topRuntimeFileLocMax: 600
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.failures).toHaveLength(0);
  });

  it('fails when strictness or count limits regress', () => {
    const metrics = createMetrics({
      tsStrictness: {
        strict: false,
        noImplicitAny: true,
        strictNullChecks: true
      },
      any: {
        occurrenceCount: 11,
        filesWithAnyCount: 3
      }
    });
    const limits = {
      strict: true,
      anyOccurrenceCountMax: 10
    };

    const evaluation = evaluateThresholds(metrics, limits);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failures).toHaveLength(2);
    expect(evaluation.failures.map((failure) => failure.metric)).toEqual([
      'tsStrictness.strict',
      'any.occurrenceCount'
    ]);
  });
});
