import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const KEEP_LOCALES = new Set(['en-US']);

const logger = (message) => {
  // Keep hook output minimal; electron-builder will surface console logs.
  console.log(`[afterPack] ${message}`);
};

async function pruneLocales(appOutDir) {
  const localesDir = path.join(appOutDir, 'locales');
  try {
    const entries = await fs.readdir(localesDir);
    const removals = entries
      .filter((name) => name.endsWith('.pak'))
      .filter((name) => !KEEP_LOCALES.has(name.replace('.pak', '')))
      .map((name) => fs.rm(path.join(localesDir, name)));
    await Promise.all(removals);
    if (removals.length) {
      logger(`Removed ${removals.length} locale pack(s) from ${localesDir}`);
    }
  } catch (error) {
    // Directory might not exist on some targets; ignore.
    logger(`Locale pruning skipped (${error.message})`);
  }
}

async function stripLinuxBinary(appOutDir, executableName) {
  const binaryPath = path.join(appOutDir, executableName);
  try {
    await fs.access(binaryPath);
  } catch {
    logger(`No binary found to strip at ${binaryPath}`);
    return;
  }

  const stripCmd = process.env.STRIP || 'strip';
  await new Promise((resolve) => {
    const child = spawn(stripCmd, ['--strip-unneeded', binaryPath], { stdio: 'ignore' });
    child.on('close', () => resolve());
    child.on('error', () => resolve());
  });
  logger(`Stripped debug symbols from ${binaryPath}`);
}

export default async function afterPack(context) {
  await pruneLocales(context.appOutDir);

  if (context.electronPlatformName === 'linux') {
    await stripLinuxBinary(context.appOutDir, context.packager.executableName);
  }
}
