import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import {
  PLATFORM_MODULES,
  platformAliasMap,
  platformAliasEntries,
  platformTsconfigPaths
} from '../../../scripts/lib/workspace-aliases.mjs';

type PlatformAliasEntry = {
  find: RegExp;
  replacement: string;
};

type TsconfigWithPaths = {
  compilerOptions: {
    paths: Record<string, string[]>;
  };
};

const MODULE_NAMES: string[] = [
  'core',
  'devices',
  'gpu',
  'ipc',
  'transcode',
  'updates'
];

describe('workspace-aliases registry', () => {
  it('declares exactly the six platform modules', () => {
    expect(PLATFORM_MODULES.map((module) => module.name).sort()).toEqual(MODULE_NAMES);
  });

  it('declares exactly the public entrypoints per module', () => {
    const entrypointsByName = Object.fromEntries(
      PLATFORM_MODULES.map((module) => [module.name, Object.keys(module.entrypoints).sort()])
    );
    expect(entrypointsByName).toEqual({
      core: ['.'],
      devices: ['.', './runtime', './testkit'],
      gpu: ['.', './runtime', './testkit'],
      ipc: ['.'],
      transcode: ['.', './service'],
      updates: ['.']
    });
  });

  it('emits object aliases with subpath keys before bare keys', () => {
    const aliasMap = platformAliasMap('/repo');
    const keys = Object.keys(aliasMap);
    expect(keys.indexOf('@platform/gpu/runtime')).toBeLessThan(keys.indexOf('@platform/gpu'));
    expect(aliasMap['@platform/gpu']).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(aliasMap['@platform/devices/runtime']).toBe(resolve('/repo', 'src/platform/devices/runtime.ts'));
  });

  it('emits exact-match regex entries for the vite array form', () => {
    const entries = platformAliasEntries('/repo') as PlatformAliasEntry[];
    const gpuBare = entries.find((entry) => entry.find.test('@platform/gpu'));
    expect(gpuBare).toBeDefined();
    expect(gpuBare.replacement).toBe(resolve('/repo', 'src/platform/gpu/index.ts'));
    expect(entries.some((entry) => entry.find.test('@platform/gpu/infrastructure/shaders'))).toBe(false);
  });

  it('emits extensionless tsconfig path targets', () => {
    const paths = platformTsconfigPaths();
    expect(paths['@platform/core']).toEqual(['./src/platform/core/index']);
    expect(paths['@platform/devices/testkit']).toEqual(['./src/platform/devices/testkit']);
    expect(Object.keys(paths).some((key) => key.includes('*'))).toBe(false);
  });

  it('tsconfig.base.json @platform paths match the registry emission', () => {
    const tsconfig = JSON.parse(readFileSync(join(process.cwd(), 'tsconfig.base.json'), 'utf8')) as TsconfigWithPaths;
    const actualPlatformPaths = Object.fromEntries(
      Object.entries(tsconfig.compilerOptions.paths).filter(([alias]) => alias.startsWith('@platform/'))
    );
    expect(actualPlatformPaths).toEqual(platformTsconfigPaths());
  });

  it('vite and vitest configs consume the registry module', () => {
    for (const configFile of ['vite.config.js', 'vitest.config.js']) {
      const configText = readFileSync(join(process.cwd(), configFile), 'utf8');
      expect(configText).toContain('workspace-aliases.mjs');
    }
  });
});
