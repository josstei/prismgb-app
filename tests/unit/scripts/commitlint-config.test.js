import { describe, expect, it } from 'vitest';
import commitlintConfig from '../../../commitlint.config.js';

function isIgnored(message) {
  return commitlintConfig.ignores.some((predicate) => predicate(message));
}

describe('commitlint configuration', () => {
  it('keeps conventional commits subject to normal linting', () => {
    expect(isIgnored('refactor(codebase): size reduction phases 0-3')).toBe(false);
    expect(commitlintConfig.rules['type-enum'][2]).toContain('refactor');
  });

  it('ignores generated Codex staging commit subjects that already exist in stacked phase history', () => {
    expect(isIgnored('[codex] consolidate renderer worker onto gpu package')).toBe(true);
    expect(isIgnored('[codex] complete generated runtime phase 2 cutover (#152)')).toBe(true);
  });
});
