import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Architecture-fitness guard: renderer DI container load strategy.
 *
 * The renderer DI container is loaded via a STATIC top-level import. The earlier
 * dynamic `import('./application/container')` wrapped in an `importWithRetry`
 * exponential-backoff helper was removed because the failure it guarded against
 * (Vite dev-server connection loss during sleep/wake) is a dev-only HMR artifact
 * that does not exist in production builds. The static form is strictly more
 * robust because it removes the lazy-chunk fetch that was the only failure surface.
 *
 * This guard prevents silent re-introduction of that inline band-aid. If a genuine
 * code-splitting need returns, introduce a first-class, DEV-guarded resilientImport
 * utility and update this guard together, deliberately, rather than re-adding an
 * untested inline retry.
 */
const bootstrapSource = readFileSync(
  path.resolve(process.cwd(), 'src/renderer/app-bootstrap.ts'),
  'utf8'
);

describe('app-bootstrap container load strategy', () => {
  it('loads the DI container via a static top-level import', () => {
    expect(bootstrapSource).toMatch(
      /import\s*\{[^}]*\binitializeContainer\b[^}]*\}\s*from\s*['"]\.\/application\/container(?:\.js)?['"]/
    );
  });

  it('does not dynamically import the container', () => {
    expect(bootstrapSource).not.toMatch(/import\(\s*['"][^'"]*application\/container/);
  });

  it('does not reintroduce the importWithRetry band-aid', () => {
    expect(bootstrapSource).not.toMatch(/importWithRetry/);
  });
});
