import fs from 'fs/promises';
import path from 'path';
import { spawn, execFile } from 'child_process';

const KEEP_LOCALES = new Set(['en-US']);

// FFmpeg binaries that need to be made executable and signed
const FFMPEG_BINARIES = ['ffmpeg', 'ffprobe'];

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
  [Arch.x64]: ['/usr/lib/x86_64-linux-gnu', '/lib/x86_64-linux-gnu', '/usr/lib64', '/usr/lib', '/lib'],
  [Arch.armv7l]: ['/usr/lib/arm-linux-gnueabihf', '/lib/arm-linux-gnueabihf', '/usr/lib', '/lib'],
  [Arch.arm64]: ['/usr/lib/aarch64-linux-gnu', '/lib/aarch64-linux-gnu', '/usr/lib64', '/usr/lib', '/lib'],
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

  // Bundle strategy: copy library to root directory for RPATH=$ORIGIN compatibility.
  // Electron's binary has RPATH=$ORIGIN, so it looks for libraries in its own directory.
  // We copy both the versioned (libz.so.1) and create unversioned symlink (libz.so).
  for (const lib of BUNDLE_LIBRARIES) {
    let srcLibPath = null;

    // Find the versioned library on the system
    for (const searchPath of searchPaths) {
      const srcPath = path.join(searchPath, lib.versioned);
      try {
        await fs.access(srcPath);
        srcLibPath = srcPath;
        break;
      } catch {
        // Library not found in this path, try next
      }
    }

    if (srcLibPath) {
      // Copy versioned library to root directory (for RPATH=$ORIGIN)
      const destPath = path.join(appOutDir, lib.versioned);
      await fs.copyFile(srcLibPath, destPath);
      logger(`Bundled ${lib.versioned} to root directory`);

      // Create unversioned symlink in root (libz.so -> libz.so.1)
      if (lib.unversioned) {
        const symlinkPath = path.join(appOutDir, lib.unversioned);
        try {
          await fs.symlink(lib.versioned, symlinkPath);
          logger(`Created symlink ${lib.unversioned} -> ${lib.versioned}`);
        } catch (error) {
          if (error.code !== 'EEXIST') {
            logger(`Failed to create symlink: ${error.message}`);
          }
        }
      }
    } else {
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

/**
 * Get the path to the unpacked asar directory containing ffmpeg/ffprobe binaries
 * @param {string} appOutDir - The output directory for the app
 * @param {string} platform - The target platform (darwin, linux, win32)
 * @returns {string} Path to the app.asar.unpacked directory
 */
function getUnpackedAsarDir(appOutDir, platform) {
  if (platform === 'darwin') {
    // macOS: Contents/Resources/app.asar.unpacked
    return path.join(appOutDir, 'PrismGB.app', 'Contents', 'Resources', 'app.asar.unpacked');
  }
  // Linux/Windows: resources/app.asar.unpacked
  return path.join(appOutDir, 'resources', 'app.asar.unpacked');
}

/**
 * Get the platform and arch subdirectories for ffprobe-static
 * ffprobe-static uses: bin/<platform>/<arch>/ffprobe (e.g., bin/linux/x64/ffprobe)
 * @param {string} platform - The target platform (darwin, linux, win32)
 * @param {number} arch - The architecture (Arch enum value)
 * @returns {string[]} Array of [platform, arch] directory names
 */
function getFfprobePlatformDirs(platform, arch) {
  const archMap = {
    [Arch.x64]: 'x64',
    [Arch.ia32]: 'ia32',
    [Arch.armv7l]: 'arm',
    [Arch.arm64]: 'arm64',
    [Arch.universal]: 'x64', // Universal builds use x64 binary
  };

  const archStr = archMap[arch] || 'x64';
  return [platform, archStr];
}

/**
 * Find the ffmpeg binary path based on platform
 * @param {string} unpackedDir - The unpacked asar directory
 * @param {string} binaryName - The binary name (ffmpeg or ffprobe)
 * @param {string} platform - The target platform
 * @param {number} arch - The architecture (Arch enum value)
 * @returns {string} Full path to the binary
 */
function getFfmpegBinaryPath(unpackedDir, binaryName, platform, arch) {
  const extension = platform === 'win32' ? '.exe' : '';
  const moduleName = binaryName === 'ffprobe' ? 'ffprobe-static' : 'ffmpeg-static';

  // ffmpeg-static stores binary directly in module root
  // ffprobe-static stores in bin/<platform>/<arch>/ffprobe
  if (binaryName === 'ffmpeg') {
    return path.join(unpackedDir, 'node_modules', moduleName, `${binaryName}${extension}`);
  } else {
    // ffprobe-static has platform-specific subdirectories: bin/<platform>/<arch>/
    const [platformDir, archDir] = getFfprobePlatformDirs(platform, arch);
    return path.join(unpackedDir, 'node_modules', moduleName, 'bin', platformDir, archDir, `${binaryName}${extension}`);
  }
}

/**
 * Get the bundled ffmpeg/ffprobe path in extraResources.
 * assets/ffmpeg/<platform>/<arch>/<binary>
 * @param {string} appOutDir - The output directory for the app
 * @param {string} binaryName - The binary name (ffmpeg or ffprobe)
 * @param {string} platform - The target platform
 * @param {number} arch - The architecture (Arch enum value)
 * @returns {string} Full path to the bundled binary
 */
function getBundledFfmpegPath(appOutDir, binaryName, platform, arch) {
  const extension = platform === 'win32' ? '.exe' : '';
  const archMap = {
    [Arch.x64]: 'x64',
    [Arch.ia32]: 'ia32',
    [Arch.armv7l]: 'arm',
    [Arch.arm64]: 'arm64',
    [Arch.universal]: 'x64',
  };
  const archDir = archMap[arch] || 'x64';
  const resourcesDir = platform === 'darwin'
    ? path.join(appOutDir, 'PrismGB.app', 'Contents', 'Resources')
    : path.join(appOutDir, 'resources');

  return path.join(resourcesDir, 'assets', 'ffmpeg', platform, archDir, `${binaryName}${extension}`);
}
/**
 * Set execute permissions on ffmpeg/ffprobe binaries for Linux and macOS
 * @param {string} appOutDir - The output directory for the app
 * @param {string} platform - The target platform
 * @param {number} arch - The architecture (Arch enum value)
 */
async function setFfmpegExecutePermissions(appOutDir, platform, arch) {
  if (platform === 'win32') {
    logger('Skipping execute permissions on Windows');
    return;
  }

  const unpackedDir = getUnpackedAsarDir(appOutDir, platform);

  for (const binaryName of FFMPEG_BINARIES) {
    const binaryPath = getFfmpegBinaryPath(unpackedDir, binaryName, platform, arch);

    try {
      await fs.access(binaryPath);
      await fs.chmod(binaryPath, 0o755);
      logger(`Set execute permissions on ${binaryName}`);
    } catch (error) {
      // Binary might not exist for this platform or already have permissions
      logger(`Could not set permissions on ${binaryName}: ${error.message}`);
    }
  }
}

/**
 * Sign ffmpeg/ffprobe binaries for macOS notarization
 * Only runs when CSC_LINK environment variable is set (code signing configured)
 * @param {string} appOutDir - The output directory for the app
 * @param {string} platform - The target platform
 * @param {number} arch - The architecture (Arch enum value)
 */
async function signFfmpegBinaries(appOutDir, platform, arch) {
  if (platform !== 'darwin') {
    return;
  }

  // Only sign if code signing is configured
  if (!process.env.CSC_LINK) {
    logger('CSC_LINK not set, skipping ffmpeg signing');
    return;
  }

  const unpackedDir = getUnpackedAsarDir(appOutDir, platform);

  // Get the signing identity from environment
  // CSC_NAME is the identity, if not set codesign will use the first valid identity
  const identity = process.env.CSC_NAME || '-';

  for (const binaryName of FFMPEG_BINARIES) {
    const unpackedPath = getFfmpegBinaryPath(unpackedDir, binaryName, platform, arch);
    const bundledPath = getBundledFfmpegPath(appOutDir, binaryName, platform, arch);

    const signBinary = async (binaryPath, label) => {
      try {
        await fs.access(binaryPath);

        // Sign the binary with hardened runtime for notarization
        await new Promise((resolve, reject) => {
          const args = [
            '--sign', identity,
            '--force',
            '--options', 'runtime',
            '--timestamp',
            binaryPath
          ];

          const child = execFile('codesign', args, (error, stdout, stderr) => {
            if (error) {
              reject(new Error(`codesign failed for ${label}: ${stderr || error.message}`));
            } else {
              resolve();
            }
          });

          child.on('error', reject);
        });

        logger(`Signed ${label} for notarization`);
      } catch (error) {
        // Log warning but don't fail the build - the binary might not exist
        logger(`Warning: Could not sign ${label}: ${error.message}`);
      }
    };

    await signBinary(unpackedPath, `${binaryName} (asar.unpacked)`);
    await signBinary(bundledPath, `${binaryName} (extraResources)`);
  }
}

export default async function afterPack(context) {
  await pruneLocales(context.appOutDir);

  const platform = context.electronPlatformName;
  const arch = context.arch;

  // Handle ffmpeg/ffprobe binaries for all platforms
  await setFfmpegExecutePermissions(context.appOutDir, platform, arch);
  await signFfmpegBinaries(context.appOutDir, platform, arch);

  if (platform === 'linux') {
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
