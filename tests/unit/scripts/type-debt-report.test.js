import { describe, expect, it } from 'vitest';
import { collectDiagnostics } from '../../../scripts/type-debt-report.js';

describe('type-debt-report', () => {
  it('aggregates strict diagnostics by file and code', () => {
    const cwd = process.cwd();
    const report = collectDiagnostics([
      `${cwd}/src/a.ts(1,2): error TS7006: x`,
      `${cwd}/src/a.ts(2,2): error TS7006: y`,
      `${cwd}/src/b.ts(3,1): error TS2322: z`
    ].join('\n'));

    expect(report.totalDiagnostics).toBe(3);
    expect(report.files).toEqual([
      { file: 'src/a.ts', count: 2 },
      { file: 'src/b.ts', count: 1 }
    ]);
    expect(report.codes).toEqual([
      { code: '7006', count: 2 },
      { code: '2322', count: 1 }
    ]);
  });
});
