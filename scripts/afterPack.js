import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';

const KEEP_LOCALES = new Set(['en-US']);

// Libraries to bundle for maximum portability on minimal Linux systems.
// See: https://github.com/AppImage/AppImageKit/issues/1092
// See: https://github.com/electron-userland/electron-builder/issues/7835
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

// Wrapper script template for non-AppImage Linux builds (deb, tar.gz).
// Sets LD_LIBRARY_PATH to include bundled libraries before launching the real binary.
const WRAPPER_SCRIPT = `#!/bin/bash
# Wrapper script to set LD_LIBRARY_PATH for bundled libraries
SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
export LD_LIBRARY_PATH="\${SCRIPT_DIR}/lib:\${SCRIPT_DIR}/usr/lib:\${LD_LIBRARY_PATH}"
exec "\${SCRIPT_DIR}/{{BINARY_NAME}}.bin" "$@"
`;

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

  // Bundle strategy (single copy + symlinks for maximum compatibility):
  // 1. Copy versioned library to usr/lib/ (e.g., usr/lib/libz.so.1)
  // 2. Create unversioned symlink in usr/lib/ (libz.so -> libz.so.1)
  // 3. Create symlink in root for RPATH=$ORIGIN (libz.so -> usr/lib/libz.so.1)
  //
  // This satisfies:
  // - Electron's RPATH=$ORIGIN (finds libz.so in root via symlink)
  // - AppRun's LD_LIBRARY_PATH=$APPDIR/usr/lib (finds libz.so in usr/lib)
  // - Avoids duplicating the library file
  const usrLibDir = path.join(appOutDir, 'usr', 'lib');
  await fs.mkdir(usrLibDir, { recursive: true });

  for (const lib of BUNDLE_LIBRARIES) {
    let bundled = false;

    // Find and copy the versioned library to usr/lib/
    for (const searchPath of searchPaths) {
      const srcPath = path.join(searchPath, lib.versioned);
      try {
        await fs.access(srcPath);
        const destPath = path.join(usrLibDir, lib.versioned);
        await fs.copyFile(srcPath, destPath);
        logger(`Bundled ${lib.versioned} to usr/lib/`);
        bundled = true;
        break;
      } catch {
        // Library not found in this path, try next
      }
    }

    if (bundled && lib.unversioned) {
      // Create unversioned symlink in usr/lib (libz.so -> libz.so.1)
      const usrLibSymlink = path.join(usrLibDir, lib.unversioned);
      try {
        await fs.symlink(lib.versioned, usrLibSymlink);
        logger(`Created symlink usr/lib/${lib.unversioned} -> ${lib.versioned}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger(`Failed to create usr/lib symlink: ${error.message}`);
        }
      }

      // Create symlink in root for RPATH=$ORIGIN (libz.so -> usr/lib/libz.so.1)
      // This allows Electron to find the library via its RPATH setting
      const rootSymlink = path.join(appOutDir, lib.unversioned);
      const relativeTarget = path.join('usr', 'lib', lib.versioned);
      try {
        await fs.symlink(relativeTarget, rootSymlink);
        logger(`Created symlink ${lib.unversioned} -> ${relativeTarget} in root`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          logger(`Failed to create root symlink: ${error.message}`);
        }
      }
    }

    if (!bundled) {
      logger(`Warning: Could not find ${lib.versioned} in any search path`);
    }
  }
}

async function createWrapperScript(appOutDir, executableName) {
  const binaryPath = path.join(appOutDir, executableName);
  const renamedBinaryPath = path.join(appOutDir, `${executableName}.bin`);

  try {
    await fs.access(binaryPath);
  } catch {
    logger(`No binary found at ${binaryPath}, skipping wrapper creation`);
    return;
  }

  // Rename the actual Electron binary
  await fs.rename(binaryPath, renamedBinaryPath);
  logger(`Renamed ${executableName} to ${executableName}.bin`);

  // Create wrapper script that sets LD_LIBRARY_PATH
  const wrapperContent = WRAPPER_SCRIPT.replace('{{BINARY_NAME}}', executableName);
  await fs.writeFile(binaryPath, wrapperContent, { mode: 0o755 });
  logger(`Created wrapper script at ${binaryPath}`);
}

export default async function afterPack(context) {
  await pruneLocales(context.appOutDir);

  if (context.electronPlatformName === 'linux') {
    const executableName = context.packager.executableName;

    // Bundle required system libraries to usr/lib (AppImage-compatible location)
    await bundleSystemLibraries(context.appOutDir, context.arch);

    // Create wrapper script that sets LD_LIBRARY_PATH.
    // This ensures bundled libraries are found at runtime for all Linux targets:
    // - AppImage: AppRun will execute our wrapper, which adds the lib paths
    // - deb/tar.gz: Users execute the wrapper directly
    await createWrapperScript(context.appOutDir, executableName);

    // Strip debug symbols from the renamed binary (.bin extension)
    await stripLinuxBinary(context.appOutDir, `${executableName}.bin`);
  }
}
