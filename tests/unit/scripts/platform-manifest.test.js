import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMatrix, loadPlatformManifest } from '../../../scripts/ci/build-matrix.mjs';
import { findExecutable, resolveSmokePlatformEntry } from '../../../scripts/smoke-test.js';

const projectRoot = process.cwd();
const tempRoots = [];

function createTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-platform-manifest-'));
  tempRoots.push(tempRoot);
  return tempRoot;
}

afterEach(() => {
  while (tempRoots.length > 0) fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
});

function loadManifest() {
  return loadPlatformManifest(path.join(projectRoot, 'scripts/manifests/platforms.manifest.json'));
}

function writeEmptyFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, '');
}

function findInTempRoot(rootDirectory, manifest, nodePlatform, nodeArch) {
  return findExecutable({ rootDirectory, manifest, nodePlatform, nodeArch });
}

function expectedMatrix(manifest, platformIds) {
  const platforms = new Map(manifest.platforms.map((platform) => [platform.id, platform]));
  return platformIds.map((id) => {
    const { os, buildScript, arch, name, label } = platforms.get(id);
    return { os, build_script: buildScript, arch, name, label };
  });
}

const syntheticManifest = {
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

function toNodePlatform(platformId) {
  if (platformId.startsWith('macos-')) return 'darwin';
  if (platformId.startsWith('windows-')) return 'win32';
  return platformId.split('-')[0];
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
