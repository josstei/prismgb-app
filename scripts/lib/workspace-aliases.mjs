/**
 * Single source of truth for the src/platform module surface.
 *
 * Every alias consumer (vite renderer/main/preload blocks, vitest sharedAlias,
 * tsconfig paths, the GPU boundary gate) derives its entries from this
 * registry so an entrypoint can never drift between resolvers. Entrypoint
 * keys mirror the former package-exports subpaths; only these specifiers
 * resolve — deep imports fail at resolution.
 */
import { posix, resolve } from 'node:path';

export const PLATFORM_ROOT = 'src/platform';

export const PLATFORM_MODULES = [
  { name: 'config', entrypoints: { '.': 'index.ts' } },
  { name: 'core', entrypoints: { '.': 'index.ts' } },
  { name: 'devices', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts', './testkit': 'testkit.ts' } },
  { name: 'events', entrypoints: { '.': 'index.ts' } },
  { name: 'gpu', entrypoints: { '.': 'index.ts', './runtime': 'runtime.ts', './testkit': 'testkit.ts' } },
  { name: 'ipc', entrypoints: { '.': 'index.ts' } },
  { name: 'notes', entrypoints: { '.': 'index.ts' } },
  { name: 'transcode', entrypoints: { '.': 'index.ts', './service': 'service.ts' } },
  { name: 'ui-base', entrypoints: { '.': 'index.ts', './reactive': 'reactive/index.ts' } },
  { name: 'updates', entrypoints: { '.': 'index.ts' } }
];

const DEFAULT_PREFIXES = ['@platform'];

function moduleSpecifier(prefix, moduleName, subpath) {
  return subpath === '.' ? `${prefix}/${moduleName}` : `${prefix}/${moduleName}${subpath.slice(1)}`;
}

function orderedEntrypoints(module) {
  return Object.entries(module.entrypoints).sort(([a], [b]) => b.length - a.length);
}

export function platformAliasMap(rootDir, prefixes = DEFAULT_PREFIXES) {
  const aliasMap = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      const target = resolve(rootDir, PLATFORM_ROOT, module.name, entryFile);
      for (const prefix of prefixes) {
        aliasMap[moduleSpecifier(prefix, module.name, subpath)] = target;
      }
    }
  }
  return aliasMap;
}

export function platformAliasEntries(rootDir, prefixes = DEFAULT_PREFIXES) {
  return Object.entries(platformAliasMap(rootDir, prefixes)).map(([specifier, replacement]) => ({
    find: new RegExp(`^${specifier.replace(/\//g, '\\/')}$`),
    replacement
  }));
}

export function platformTsconfigPaths(prefixes = DEFAULT_PREFIXES) {
  const paths = {};
  for (const module of PLATFORM_MODULES) {
    for (const [subpath, entryFile] of orderedEntrypoints(module)) {
      const target = `./${posix.join(PLATFORM_ROOT, module.name, entryFile.replace(/\.ts$/, ''))}`;
      for (const prefix of prefixes) {
        paths[moduleSpecifier(prefix, module.name, subpath)] = [target];
      }
    }
  }
  return paths;
}
