#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const manifestPath = fileURLToPath(new URL('../manifests/platforms.manifest.json', import.meta.url));

export function loadPlatformManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function resolveReleasePlatformIds(manifest, groupName) {
  const group = groupName.toLowerCase();
  const platformIds = manifest.platformGroups[group];
  if (!platformIds) {
    throw new Error(`Unsupported platforms value: ${group}`);
  }
  return platformIds;
}

function resolveSmokePlatformIds(manifest, inputName) {
  const input = inputName.toLowerCase();
  if (input === 'all') {
    return manifest.platformGroups.all;
  }
  if (!manifest.platforms.some((platform) => platform.id === input)) {
    throw new Error(`Unsupported platform value: ${input}`);
  }
  return [input];
}

export function buildMatrix(manifest, options) {
  const { mode } = options;
  if (!mode) {
    throw new Error('Missing required --mode argument (release|smoke).');
  }
  if (mode !== 'release' && mode !== 'smoke') {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const platformIds = mode === 'release'
    ? resolveReleasePlatformIds(manifest, options.platforms || 'all')
    : resolveSmokePlatformIds(manifest, options.platform || 'all');
  const platformsById = new Map(manifest.platforms.map((entry) => [entry.id, entry]));

  return platformIds.map((platformId) => {
    const entry = platformsById.get(platformId);
    if (!entry) {
      throw new Error(`Platform group references unknown platform: ${platformId}`);
    }
    return { os: entry.os, build_script: entry.buildScript, arch: entry.arch, name: entry.name, label: entry.id };
  });
}

function main() {
  try {
    const { values } = parseArgs({
      options: {
        mode: { type: 'string' },
        platforms: { type: 'string' },
        platform: { type: 'string' }
      }
    });
    process.stdout.write(JSON.stringify(buildMatrix(loadPlatformManifest(), values)));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}
