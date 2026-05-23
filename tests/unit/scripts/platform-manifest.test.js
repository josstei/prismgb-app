import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildMatrix, loadPlatformManifest } from '../../../scripts/ci/build-matrix.mjs';
import { findExecutable } from '../../../scripts/smoke-test.js';

const projectRoot = process.cwd();
const tempRoots = [];

function createTempRoot() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-platform-manifest-'));
  tempRoots.push(tempRoot);
  fs.mkdirSync(path.join(tempRoot, 'release'), { recursive: true });
  return tempRoot;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('platform manifest helpers', () => {
  it('builds release and smoke matrices from platform groups and aliases', () => {
    const manifest = loadPlatformManifest(
      path.join(projectRoot, 'scripts/manifests/platforms.manifest.json')
    );

    expect(buildMatrix(manifest, { mode: 'release', platforms: 'linux' })).toEqual([
      expect.objectContaining({ label: 'linux-x64', build_script: 'build:linux' }),
      expect.objectContaining({ label: 'linux-arm64', build_script: 'build:linux' })
    ]);
    expect(buildMatrix(manifest, { mode: 'smoke', platform: 'windows' })).toEqual([
      expect.objectContaining({ label: 'windows-x64', build_script: 'build:win' })
    ]);
    expect(buildMatrix(manifest, { mode: 'smoke', platform: 'macos-arm64' })).toEqual([
      expect.objectContaining({ label: 'macos-arm64', os: 'macos-15' })
    ]);
  });

  it('uses manifest smoke executable priority for packaged app discovery', () => {
    const manifest = loadPlatformManifest(
      path.join(projectRoot, 'scripts/manifests/platforms.manifest.json')
    );
    const tempRoot = createTempRoot();
    const appImagePath = path.join(tempRoot, 'release', 'PrismGB-linux-x64.AppImage');
    fs.writeFileSync(appImagePath, '');

    expect(findExecutable({
      rootDirectory: tempRoot,
      manifest,
      nodePlatform: 'linux',
      nodeArch: 'x64'
    })).toBe(appImagePath);
    expect((fs.statSync(appImagePath).mode & 0o777).toString(8)).toBe('755');
  });

  it('falls back through manifest smoke executable candidates', () => {
    const manifest = loadPlatformManifest(
      path.join(projectRoot, 'scripts/manifests/platforms.manifest.json')
    );
    const tempRoot = createTempRoot();
    const executablePath = path.join(tempRoot, 'release', 'win-unpacked', 'PrismGB.exe');
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, '');

    expect(findExecutable({
      rootDirectory: tempRoot,
      manifest,
      nodePlatform: 'win32',
      nodeArch: 'x64'
    })).toBe(executablePath);
  });
});
