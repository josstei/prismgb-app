import { describe, expect, it } from 'vitest';
import commitlintConfig from '../../../commitlint.config.js';

describe('commitlint configuration', () => {
  it('keeps conventional commits subject to normal linting', () => {
    expect(commitlintConfig.rules['type-enum'][2]).toContain('refactor');
  });
});
