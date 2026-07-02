import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  PLATFORM_MODULES,
  platformAliasMap,
  platformAliasEntries,
  platformTsconfigPaths
} from '../../../scripts/lib/workspace-aliases.mjs';

const MODULE_NAMES = [
  'config',
  'core',
  'devices',
  'events',
  'gpu',
  'ipc',
  'notes',
  'transcode',
  'ui-base',
  'updates'
];

describe('workspace-aliases registry', () => {
  it('declares exactly the ten platform modules', () => {
    expect(PLATFORM_MODULES.map((module) => module.name).sort()).toEqual(MODULE_NAMES);
  });

  it('declares exactly the public entrypoints per module', () => {
    const entrypointsByName = Object.fromEntries(
      PLATFORM_MODULES.map((module) => [module.name, Object.keys(module.entrypoints).sort()])
    );
    expect(entrypointsByName).toEqual({
      config: ['.'],
      core: ['.'],
      devices: ['.', './runtime', './testkit'],
      events: ['.'],
      gpu: ['.', './runtime'],
      ipc: ['.'],
      notes: ['.'],
      transcode: ['.', './service'],
      'ui-base': ['.', './reactive'],
      updates: ['.']
    });
  });

  it('emits object aliases with subpath keys before bare keys', () => {
    const aliasMap = platformAliasMap('/repo');
    const keys = Object.keys(aliasMap);
    expect(keys.indexOf('@platform/gpu/runtime')).toBeLessThan(keys.indexOf('@platform/gpu'));
    expect(aliasMap['@platform/gpu']).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(aliasMap['@platform/ui-base/reactive']).toBe(resolve('/repo', 'src/platform/ui-base/reactive/index.ts'));
  });

  it('emits exact-match regex entries for the vite array form', () => {
    const entries = platformAliasEntries('/repo');
    const gpuBare = entries.find((entry) => entry.find.test('@platform/gpu'));
    expect(gpuBare.replacement).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(entries.some((entry) => entry.find.test('@platform/gpu/infrastructure/shaders'))).toBe(false);
  });

  it('emits extensionless tsconfig path targets', () => {
    const paths = platformTsconfigPaths();
    expect(paths['@platform/core']).toEqual(['./src/platform/core/index']);
    expect(paths['@platform/devices/testkit']).toEqual(['./src/platform/devices/testkit']);
    expect(Object.keys(paths).some((key) => key.includes('*'))).toBe(false);
  });

  it('supports a compat prefix during migration', () => {
    const aliasMap = platformAliasMap('/repo', ['@platform', '@prismgb']);
    expect(aliasMap['@prismgb/core']).toBe(resolve('/repo', 'src/platform/core/index.ts'));
    expect(aliasMap['@platform/core']).toBe(resolve('/repo', 'src/platform/core/index.ts'));
  });
});
