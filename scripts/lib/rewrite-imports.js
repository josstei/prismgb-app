/**
 * MOVE PROCEDURE (per file):
 *   1. git mv <old> <new>
 *   2. For each (oldSpec -> newSpec): rewrite across src/ and tests/ (excluding tests/fixtures/):
 *        node -e "import('./scripts/lib/rewrite-imports.js').then(m=>{const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,m.rewriteImportPath(fs.readFileSync(f,'utf8'),process.argv[2],process.argv[3]))})" <file> <oldSpec> <newSpec>
 *      (or use a small batch wrapper over `grep -rl <oldSpec> src tests | grep -v tests/fixtures`)
 *   3. node scripts/generate-di.js   (if the moved file is @Service-decorated)
 *   4. Run GATE.
 */

/**
 * Rewrites an exact module-specifier prefix on `import ... from '<spec>'`,
 * `import '<spec>'`, and `export ... from '<spec>'` lines only. Leaves
 * non-import string literals untouched. Matches optional trailing .js/.ts.
 */
export function rewriteImportPath(source, fromSpec, toSpec) {
  const esc = fromSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match `from '<spec>'` / `from "<spec>"` / `import '<spec>'` with optional .js/.ts and optional /subpath
  const re = new RegExp(`((?:from|import|export[^'"\\n]*from)\\s*['"])${esc}((?:\\.(?:js|ts))?['"])`, 'g');
  const re2 = new RegExp(`(import\\s*['"])${esc}((?:\\.(?:js|ts))?['"])`, 'g');
  return source.replace(re, `$1${toSpec}$2`).replace(re2, `$1${toSpec}$2`);
}
