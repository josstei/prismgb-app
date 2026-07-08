/**
 * Single source of truth for the src/platform module surface.
 *
 * Every alias consumer (vite renderer/main/preload blocks, vitest sharedAlias,
 * tsconfig paths, the GPU boundary gate) derives its entries from this
 * registry so an entrypoint can never drift between resolvers. Entrypoint
 * keys define the public module subpaths; only these specifiers resolve —
 * deep imports fail at resolution.
 */
import { posix, resolve } from 'node:path';

export const PLATFORM_ROOT = 'src/platform';
export const PLATFORM_PREFIX = '@platform';

export const PLATFORM_MODULES = [
  { name: 'config', entrypoints: { '.': 'index.ts' } },
  { name: 'core', entrypoints: { '.': 'index.ts' } },
  { name: 'devices', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts', './testkit': 'testkit.ts' } },
  { name: 'events', entrypoints: { '.': 'index.ts' } },
  { name: 'gpu', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts', './testkit': 'testkit.ts' } },
  { name: 'ipc', entrypoints: { '.': 'index.ts' } },
  { name: 'notes', entrypoints: { '.': 'index.ts' } },
  { name: 'transcode', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts' } },
  { name: 'ui-base', entrypoints: { '.': 'index.ts', './reactive': 'reactive/index.ts' } },
  { name: 'updates', entrypoints: { '.': 'index.ts' } }
];

function moduleSpecifier(moduleName, subpath) {
  return subpath === '.' ? `${PLATFORM_PREFIX}/${moduleName}` : `${PLATFORM_PREFIX}/${moduleName}${subpath.slice(1)}`;
}

function orderedEntrypoints(module) {
  return Object.entries(module.entrypoints).sort(([a], [b]) => b.length - a.length);
}

export function platformAliasMap(rootDir) {
  const aliasMap = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      aliasMap[moduleSpecifier(module.name, subpath)] = resolve(rootDir, PLATFORM_ROOT, module.name, entryFile);
    }
  }
  return aliasMap;
}

export function platformAliasEntries(rootDir) {
  return Object.entries(platformAliasMap(rootDir)).map(([specifier, replacement]) => ({
    find: new RegExp(`^${specifier.replace(/\//g, '\\/')}$`),
    replacement
  }));
}

export function platformTsconfigPaths() {
  const paths = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      paths[moduleSpecifier(module.name, subpath)] = [
        `./${posix.join(PLATFORM_ROOT, module.name, entryFile.replace(/\.ts$/, ''))}`
      ];
    }
  }
  return paths;
}
