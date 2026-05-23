#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const defaultManifestPath = path.join(projectRoot, 'scripts/manifests/platforms.manifest.json');

export function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }
    parsed[arg.slice(2)] = argv[index + 1];
    index += 1;
  }
  return parsed;
}

export function loadPlatformManifest(manifestPath = defaultManifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function toMatrixEntry(platform) {
  return {
    os: platform.os,
    build_script: platform.buildScript,
    arch: platform.arch,
    name: platform.name,
    label: platform.label
  };
}

function getPlatformById(manifest) {
  return new Map(manifest.platforms.map((platform) => [platform.id, platform]));
}

function resolveReleasePlatformIds(manifest, groupName) {
  const group = groupName.toLowerCase();
  const platformIds = manifest.platformGroups?.[group];
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

  const resolvedInput = manifest.smokeInputAliases?.[input] ?? input;
  const platform = manifest.platforms.find(
    (entry) => entry.id === resolvedInput || entry.label === resolvedInput || entry.smokeInput === input
  );
  if (!platform) {
    throw new Error(`Unsupported platform value: ${input}`);
  }

  return [platform.id];
}

export function buildMatrix(manifest, options) {
  const mode = options.mode;
  if (!mode) {
    throw new Error('Missing required --mode argument (release|smoke).');
  }

  const platformIds = mode === 'release'
    ? resolveReleasePlatformIds(manifest, options.platforms || 'all')
    : mode === 'smoke'
      ? resolveSmokePlatformIds(manifest, options.platform || 'all')
      : null;

  if (!platformIds) {
    throw new Error(`Unsupported mode: ${mode}`);
  }

  const platformsById = getPlatformById(manifest);
  return platformIds.map((platformId) => {
    const platform = platformsById.get(platformId);
    if (!platform) {
      throw new Error(`Platform group references unknown platform: ${platformId}`);
    }
    return toMatrixEntry(platform);
  });
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    const matrix = buildMatrix(loadPlatformManifest(), options);
    process.stdout.write(JSON.stringify(matrix));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}
