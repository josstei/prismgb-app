import { describe, expect, it } from 'vitest';
import {
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
