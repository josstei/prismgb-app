#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const LOCKFILE_NAME = 'package-lock.json';
const NATIVE_DEPENDENCIES = ['usb'];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getPackageEntry(lockfile, entryPath) {
  return lockfile.packages?.[entryPath] ?? null;
}

function getDependencyVersion(lockfile, entryPath) {
  return getPackageEntry(lockfile, entryPath)?.version ?? 'not locked';
}

function getRootElectronRange(lockfile) {
  const root = getPackageEntry(lockfile, '');
  return root?.devDependencies?.electron ?? root?.dependencies?.electron ?? null;
}

export function collectElectronNativeAbiContext(projectRoot = process.cwd()) {
  const lockfilePath = path.join(projectRoot, LOCKFILE_NAME);
  const lockfile = readJson(lockfilePath);
  const electron = getPackageEntry(lockfile, 'node_modules/electron');

  return {
    electronRange: getRootElectronRange(lockfile),
    electronVersion: electron?.version ?? null,
    electronBuilderVersion: getDependencyVersion(lockfile, 'node_modules/electron-builder'),
    electronRebuildVersion: getDependencyVersion(lockfile, 'node_modules/@electron/rebuild'),
    nodeAbiVersion:
      getDependencyVersion(lockfile, 'node_modules/@electron/rebuild/node_modules/node-abi') !== 'not locked'
        ? getDependencyVersion(lockfile, 'node_modules/@electron/rebuild/node_modules/node-abi')
        : getDependencyVersion(lockfile, 'node_modules/node-abi'),
    nativeDependencies: NATIVE_DEPENDENCIES,
    lockfilePath
  };
}

function loadElectronRebuildNodeAbi(projectRoot) {
  const rootRequire = createRequire(path.join(projectRoot, 'package.json'));
  const rebuildMainPath = rootRequire.resolve('@electron/rebuild');
  const rebuildPackagePath = path.join(path.dirname(path.dirname(rebuildMainPath)), 'package.json');
  const rebuildRequire = createRequire(rebuildPackagePath);
  return rebuildRequire('node-abi');
}

function formatContext(context) {
  return [
    `electron range: ${context.electronRange ?? 'not declared'}`,
    `electron lockfile version: ${context.electronVersion ?? 'not locked'}`,
    `electron-builder lockfile version: ${context.electronBuilderVersion}`,
    `@electron/rebuild lockfile version: ${context.electronRebuildVersion}`,
    `node-abi lockfile version: ${context.nodeAbiVersion}`,
    `native runtime dependencies: ${context.nativeDependencies.join(', ')}`
  ].join('\n');
}

export function checkElectronNativeAbi({
  projectRoot = process.cwd(),
  nodeAbi = loadElectronRebuildNodeAbi(projectRoot)
} = {}) {
  const context = collectElectronNativeAbiContext(projectRoot);

  if (!context.electronRange || !context.electronVersion) {
    return {
      passed: false,
      context,
      message: [
        'Electron native module ABI check failed: Electron is not declared and locked consistently.',
        formatContext(context)
      ].join('\n')
    };
  }

  try {
    const abi = nodeAbi.getAbi(context.electronVersion, 'electron');
    return {
      passed: true,
      abi,
      context,
      message: [
        `Electron native module ABI check passed: Electron ${context.electronVersion} uses ABI ${abi}.`,
        formatContext(context)
      ].join('\n')
    };
  } catch (error) {
    return {
      passed: false,
      context,
      error,
      message: [
        'Electron native module ABI check failed: the packaging rebuild stack cannot resolve this Electron ABI.',
        formatContext(context),
        `node-abi error: ${error.message}`,
        'Resolution: keep Electron on a builder-supported major, or upgrade electron-builder/@electron/rebuild/node-abi together and regenerate package-lock.json before packaging native modules.'
      ].join('\n')
    };
  }
}

function main() {
  const result = checkElectronNativeAbi();
  const output = result.passed ? console.log : console.error;
  output(result.message);
  process.exit(result.passed ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
