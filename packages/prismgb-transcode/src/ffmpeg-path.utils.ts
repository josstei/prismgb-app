/**
 * FFmpeg Path Utilities
 *
 * Resolves paths to ffmpeg and ffprobe binaries for both
 * development and packaged application contexts.
 */

import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

// Create require for CommonJS module resolution
const require = createRequire(import.meta.url);

let isPackagedVal: boolean | null = null;
function checkIsPackaged(): boolean {
  if (isPackagedVal !== null) return isPackagedVal;
  try {
    const { app } = require('electron');
    isPackagedVal = app.isPackaged;
  } catch {
    isPackagedVal = false;
  }
  return isPackagedVal ?? false;
}

/**
 * Binary paths for FFmpeg components
 */
export interface FfmpegBinaryPaths {
  ffmpegPath: string;
  ffprobePath: string | null;
}

/**
 * Get the path to the ffmpeg binary
 * @returns Absolute path to ffmpeg executable
 */
export function getFfmpegPath(): string {
  const isPackaged = checkIsPackaged();
  const platform = process.platform;
  const executableName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

  const envPath = process.env.FFMPEG_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  if (isPackaged) {
    // In packaged app, binaries are unpacked to app.asar.unpacked
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffmpeg-static',
      executableName
    );

    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }

    // Fallback: try without .asar.unpacked (some build configs)
    const fallbackPath = path.join(
      process.resourcesPath,
      'node_modules',
      'ffmpeg-static',
      executableName
    );

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  // Development mode: use the npm package directly
  // ffmpeg-static exports the path to the binary
  try {
    // The ffmpeg-static package exports the binary path directly
    const ffmpegStaticPath = require('ffmpeg-static');
    if (ffmpegStaticPath && fs.existsSync(ffmpegStaticPath)) {
      return ffmpegStaticPath;
    }
  } catch {
    // Try manual path resolution as fallback
  }

  // Manual fallback path
  const manualPath = path.join(
    process.cwd(),
    'node_modules',
    'ffmpeg-static',
    executableName
  );

  if (fs.existsSync(manualPath)) {
    return manualPath;
  }

  const systemPath = resolveSystemBinary('ffmpeg');
  if (systemPath) {
    return systemPath;
  }

  throw new Error(`FFmpeg binary not found. Platform: ${platform}, Packaged: ${isPackaged}`);
}

/**
 * Get the path to the ffprobe binary
 * @returns Absolute path to ffprobe executable
 */
export function getFfprobePath(): string {
  const isPackaged = checkIsPackaged();
  const platform = process.platform;
  const executableName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

  const envPath = process.env.FFPROBE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  // Determine the correct subdirectories for the platform
  // ffprobe-static uses: bin/<platform>/<arch>/ffprobe
  const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';

  if (isPackaged) {
    // In packaged app, binaries are unpacked to app.asar.unpacked
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffprobe-static',
      'bin',
      platform,
      archDir,
      executableName
    );

    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }

    // Fallback: try without .asar.unpacked
    const fallbackPath = path.join(
      process.resourcesPath,
      'node_modules',
      'ffprobe-static',
      'bin',
      platform,
      archDir,
      executableName
    );

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  // Development mode: use the npm package directly
  try {
    // ffprobe-static exports a .path property with the binary location
    const ffprobeStatic = require('ffprobe-static');
    if (ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
      return ffprobeStatic.path;
    }
  } catch {
    // Try manual path resolution as fallback
  }

  // Manual fallback path
  const manualPath = path.join(
    process.cwd(),
    'node_modules',
    'ffprobe-static',
    'bin',
    platform,
    archDir,
    executableName
  );

  if (fs.existsSync(manualPath)) {
    return manualPath;
  }

  const systemPath = resolveSystemBinary('ffprobe');
  if (systemPath) {
    return systemPath;
  }

  throw new Error(`FFprobe binary not found. Platform: ${platform}, Packaged: ${isPackaged}`);
}

/**
 * Get the path to the ffprobe binary if available
 * @returns Absolute path to ffprobe executable or null
 */
export function getOptionalFfprobePath(): string | null {
  try {
    return getFfprobePath();
  } catch {
    return null;
  }
}

/**
 * Validate that both ffmpeg and ffprobe binaries exist and are executable
 * @returns Paths to both binaries
 * @throws Error if either binary is not found
 */
export function validateFfmpegBinaries(): FfmpegBinaryPaths {
  const ffmpegPath = getFfmpegPath();
  const ffprobePath = getOptionalFfprobePath();

  // Check if files exist (already done in get functions, but double-check)
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg binary not found at: ${ffmpegPath}`);
  }

  return { ffmpegPath, ffprobePath };
}

function resolveSystemBinary(binaryName: string): string | null {
  try {
    const resolved = execSync(`command -v ${binaryName}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  } catch {
    // Ignore missing system binaries
  }
  return null;
}
