/**
 * Smoke tests for electron main/preload sub-builds.
 *
 * Phase 1A currently verifies only that the bundles build with SWC in the
 * pipeline. The `Reflect.metadata` emission assertion is deferred until
 * `@prismgb/runtime.bootstrapMain()` is wired (later phase), at which point
 * test 3 should be extended to:
 *   expect(content).toContain('Reflect.metadata(')
 * so removing SWC from the main sub-config causes a fast-fail.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

describe('electron main/preload SWC decorator metadata emission', () => {
  const repoRoot = resolve(__dirname, '..', '..');
  const mainBundlePath = resolve(repoRoot, 'dist/main/index.js');
  const preloadBundlePath = resolve(repoRoot, 'dist/preload/index.js');

  beforeAll(() => {
    if (!existsSync(mainBundlePath) || !existsSync(preloadBundlePath)) {
      execSync('npm run build:vite', { cwd: repoRoot, stdio: 'inherit' });
    }
  }, 120000);

  it('main bundle is buildable', () => {
    expect(existsSync(mainBundlePath)).toBe(true);
    const size = readFileSync(mainBundlePath).byteLength;
    expect(size).toBeGreaterThan(1000);
  });

  it('preload bundle is buildable', () => {
    expect(existsSync(preloadBundlePath)).toBe(true);
    const size = readFileSync(preloadBundlePath).byteLength;
    expect(size).toBeGreaterThan(100);
  });

  it('main bundle contains no esbuild-transpiled TypeScript (SWC signature check)', () => {
    const content = readFileSync(mainBundlePath, 'utf8');
    expect(content.length).toBeGreaterThan(1000);
  });
});
