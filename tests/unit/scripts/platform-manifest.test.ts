import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMatrix, loadPlatformManifest } from '../../../scripts/ci/build-matrix.mjs';
import { findExecutable, resolveSmokePlatformEntry } from '../../../scripts/smoke-test.js';

type PlatformEntry = {
  id: string;
  label: string;
  name: string;
  os: string;
  arch: NodeJS.Architecture;
  buildScript: string;
  smokeInput?: string;
  smokeExecutablePriority: string[];
};

type PlatformManifest = {
  platformGroups: Record<string, string[]>;
  smokeInputAliases: Record<string, string>;
  platforms: PlatformEntry[];
};

type MatrixEntry = {
  os: string;
  build_script: string;
  arch: string;
  name: string;
  label: string;
};

const projectRoot = process.cwd();
const tempRoots: string[] = [];

function createTempRoot(): string {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-platform-manifest-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(() => {
  while (tempRoots.length > 0) fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
});

function loadManifest(): PlatformManifest {
  return loadPlatformManifest(path.join(projectRoot, 'scripts/manifests/platforms.manifest.json')) as PlatformManifest;
}

function writeEmptyFile(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');
}

function findInTempRoot(
  rootDirectory: string,
  manifest: PlatformManifest,
  nodePlatform: NodeJS.Platform,
  nodeArch: NodeJS.Architecture
): string | null {
  return findExecutable({ rootDirectory, manifest, nodePlatform, nodeArch });
}

function expectedMatrix(manifest: PlatformManifest, platformIds: string[]): MatrixEntry[] {
  const platforms = new Map<string, PlatformEntry>(manifest.platforms.map((platform) => [platform.id, platform]));
  return platformIds.map((id) => {
    const platform = platforms.get(id);
    if (!platform) {
      throw new Error(`Missing manifest platform: ${id}`);
    }
    const { os, buildScript, arch, name, label } = platform;
    return { os, build_script: buildScript, arch, name, label };
  });
}

const syntheticManifest: PlatformManifest = {
  platformGroups: { bespoke: ['linux-x64', 'plan9-x64'] },
  smokeInputAliases: { daily: 'plan9-x64' },
  platforms: [
    {
      id: 'linux-x64', label: 'synthetic-linux', name: 'Synthetic Linux', os: 'linux-ci',
      arch: 'x64', buildScript: 'build:synthetic-linux',
      smokeExecutablePriority: ['release/custom-first/*.AppImage', 'release/custom-second/prismgb']
    },
    {
      id: 'plan9-x64', label: 'synthetic-plan9', name: 'Synthetic Plan9', os: 'plan9-ci',
      arch: 'x64', buildScript: 'build:synthetic-plan9',
      smokeExecutablePriority: ['release/plan9/prismgb']
    }
  ]
};

function toNodePlatform(platformId: string): NodeJS.Platform {
  if (platformId.startsWith('macos-')) return 'darwin';
  if (platformId.startsWith('windows-')) return 'win32';
  return platformId.split('-')[0] as NodeJS.Platform;
}

describe('platform manifest helpers', () => {
  it('builds release and smoke matrices from platform groups and aliases', () => {
    const manifest = loadManifest();

    Object.entries(manifest.platformGroups).forEach(([group, platformIds]) => {
      expect(buildMatrix(manifest, { mode: 'release', platforms: group }))
        .toEqual(expectedMatrix(manifest, platformIds));
    });
    Object.entries(manifest.smokeInputAliases).forEach(([alias, platformId]) => {
      expect(buildMatrix(manifest, { mode: 'smoke', platform: alias }))
        .toEqual(expectedMatrix(manifest, [platformId]));
    });
    expect(buildMatrix(manifest, { mode: 'smoke', platform: 'macos-arm64' }))
      .toEqual(expectedMatrix(manifest, ['macos-arm64']));
    manifest.platforms.forEach((platform) => {
      expect(resolveSmokePlatformEntry(manifest, {
        nodePlatform: toNodePlatform(platform.id),
        nodeArch: platform.arch
      })).toEqual(platform);
    });
    expect(buildMatrix(syntheticManifest, { mode: 'release', platforms: 'bespoke' })).toEqual(expectedMatrix(syntheticManifest, ['linux-x64', 'plan9-x64']));
    expect(buildMatrix(syntheticManifest, { mode: 'smoke', platform: 'daily' })).toEqual(expectedMatrix(syntheticManifest, ['plan9-x64']));
  });

  it('uses manifest smoke executable priority for packaged app discovery', () => {
    const tempRoot = createTempRoot();
    const fallbackPath = path.join(tempRoot, 'release', 'custom-second', 'prismgb');
    const appImagePath = path.join(tempRoot, 'release', 'custom-first', 'Synthetic.AppImage');
    writeEmptyFile(fallbackPath);
    writeEmptyFile(appImagePath);

    expect(findInTempRoot(tempRoot, syntheticManifest, 'linux', 'x64')).toBe(appImagePath);
    expect((fs.statSync(appImagePath).mode & 0o777).toString(8)).toBe('755');
  });

  it('falls back through manifest smoke executable candidates', () => {
    const manifest = loadManifest();
    const tempRoot = createTempRoot();
    const executablePath = path.join(tempRoot, 'release', 'win-unpacked', 'PrismGB.exe');
    writeEmptyFile(executablePath);

    expect(findInTempRoot(tempRoot, manifest, 'win32', 'x64')).toBe(executablePath);
  });
});
