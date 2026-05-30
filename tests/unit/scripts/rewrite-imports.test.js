import { describe, it, expect } from 'vitest';
import { rewriteImportPath } from '../../../scripts/lib/rewrite-imports.js';

describe('rewriteImportPath', () => {
  it('rewrites an alias path prefix on import/from lines only', () => {
    const src = "import { A } from '@renderer/infrastructure/services/foo';\nconst x = '@renderer/infrastructure/services/foo';";
    const out = rewriteImportPath(src, '@renderer/infrastructure/services/foo', '@renderer/infrastructure/services/devices/foo');
    expect(out).toContain("from '@renderer/infrastructure/services/devices/foo'");
    // non-import string literal is left untouched
    expect(out).toContain("const x = '@renderer/infrastructure/services/foo'");
  });

  it('handles both quote styles and trailing .js/.ts specifiers', () => {
    const src = "import './services/foo.js';\nimport \"@renderer/infrastructure/services/foo\";";
    const out = rewriteImportPath(src, '@renderer/infrastructure/services/foo', '@renderer/infrastructure/services/devices/foo');
    expect(out).toContain("import \"@renderer/infrastructure/services/devices/foo\"");
  });
});
