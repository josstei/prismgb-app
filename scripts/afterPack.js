import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const KEEP_LOCALES = new Set(['en-US']);

// Libraries to bundle in AppImage for maximum portability on minimal Linux systems.
// See: https://github.com/AppImage/AppImageKit/issues/1092
// The issue is Electron links against libz.so (unversioned) which doesn't exist
// on minimal installations - only libz.so.1 (versioned) is present.
const BUNDLE_LIBRARIES = [
  { versioned: 'libz.so.1', unversioned: 'libz.so' },
];

// electron-builder Arch enum values
const Arch = {
  ia32: 0,
  x64: 1,
  armv7l: 2,
  arm64: 3,
  universal: 4,
};

// Search paths for system libraries by architecture (keyed by Arch enum value)
const LIB_SEARCH_PATHS = {
  [Arch.arm64]: ['/usr/lib/aarch64-linux-gnu', '/lib/aarch64-linux-gnu', '/usr/lib', '/lib'],
  [Arch.x64]: ['/usr/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu', '/usr/lib64', '/usr/lib', '/lib'],
  [Arch.armv7l]: ['/usr/lib/arm-linux-gnueabihf', '/lib/arm-linux-gnueabihf', '/usr/lib', '/lib'],
  [Arch.ia32]: ['/usr/lib/i386-linux-gnu', '/lib/i386-linux-gnu', '/usr/lib32', '/usr/lib', '/lib'],
};

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

async function bundleSystemLibraries(appOutDir, arch) {
  const searchPaths = LIB_SEARCH_PATHS[arch];
  if (!searchPaths) {
    logger(`Unknown architecture ${arch}, skipping library bundling`);
    return;
  }

  const libDir = path.join(appOutDir, 'lib');
  await fs.mkdir(libDir, { recursive: true });

  for (const lib of BUNDLE_LIBRARIES) {
    let bundled = false;

    // Find and copy the versioned library
    for (const searchPath of searchPaths) {
      const srcPath = path.join(searchPath, lib.versioned);
      try {
        await fs.access(srcPath);
        const destPath = path.join(libDir, lib.versioned);
        await fs.copyFile(srcPath, destPath);
        logger(`Bundled ${lib.versioned} from ${searchPath}`);
        bundled = true;
        break;
      } catch {
        // Library not found in this path, try next
      }
    }

    // Create unversioned symlink (e.g., libz.so -> libz.so.1)
    if (bundled && lib.unversioned) {
      const symlinkPath = path.join(libDir, lib.unversioned);
      try {
        await fs.symlink(lib.versioned, symlinkPath);
        logger(`Created symlink ${lib.unversioned} -> ${lib.versioned}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger(`Failed to create symlink: ${error.message}`);
        }
      }
    }

    if (!bundled) {
      logger(`Warning: Could not find ${lib.versioned} in any search path`);
    }
  }
}

export default async function afterPack(context) {
  await pruneLocales(context.appOutDir);

  if (context.electronPlatformName === 'linux') {
    await stripLinuxBinary(context.appOutDir, context.packager.executableName);
    await bundleSystemLibraries(context.appOutDir, context.arch);
  }
}
