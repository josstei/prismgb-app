/**
 * Playwright global setup.
 *
 * Bundles the devices testkit into a plain ESM artifact before any spec
 * loads. Playwright resolves imports with plain Node — no vite, vitest, or
 * tsconfig alias layer — so the platform modules' TypeScript sources and
 * @platform specifiers are unreachable from e2e helpers without this
 * prebundle. Resolution truth stays in scripts/lib/workspace-aliases.mjs.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { platformAliasMap } from '../../scripts/lib/workspace-aliases.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tests/e2e/.generated');

export default async function globalSetup() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  await build({
    entryPoints: [path.join(PROJECT_ROOT, 'src/platform/devices/testkit.ts')],
    outfile: path.join(OUTPUT_DIR, 'devices-testkit.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    alias: platformAliasMap(PROJECT_ROOT)
  });
}
