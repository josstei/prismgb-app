import { describe, expect, it } from 'vitest';
import commitlintConfig from '../../../commitlint.config.js';

type CommitlintRuleTuple = readonly [number, string, readonly string[]];

describe('commitlint configuration', () => {
  it('keeps conventional commits subject to normal linting', () => {
    const typeEnumRule = commitlintConfig.rules['type-enum'] as unknown as CommitlintRuleTuple;
    expect(typeEnumRule[2]).toContain('refactor');
  });
});
