/**
 * FFmpeg Path Utilities
 *
 * Resolves paths to ffmpeg and ffprobe binaries for both
 * development and packaged application contexts.
 */

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// Create require for CommonJS module resolution
const require = createRequire(import.meta.url);

/**
 * Get the path to the ffmpeg binary
 * @returns {string} Absolute path to ffmpeg executable
 */
export function getFfmpegPath() {
  const isPackaged = app.isPackaged;
  const platform = process.platform;
  const executableName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';

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

  throw new Error(`FFmpeg binary not found. Platform: ${platform}, Packaged: ${isPackaged}`);
}

/**
 * Get the path to the ffprobe binary
 * @returns {string} Absolute path to ffprobe executable
 */
export function getFfprobePath() {
  const isPackaged = app.isPackaged;
  const platform = process.platform;
  const executableName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

  // Determine the correct subdirectory for the platform
  let platformDir;
  switch (platform) {
    case 'darwin':
      platformDir = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
      break;
    case 'win32':
      platformDir = 'win32-x64';
      break;
    case 'linux':
    default:
      platformDir = process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
      break;
  }

  if (isPackaged) {
    // In packaged app, binaries are unpacked to app.asar.unpacked
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'ffprobe-static',
      'bin',
      platformDir,
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
      platformDir,
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
    platformDir,
    executableName
  );

  if (fs.existsSync(manualPath)) {
    return manualPath;
  }

  throw new Error(`FFprobe binary not found. Platform: ${platform}, Packaged: ${isPackaged}`);
}

/**
 * Validate that both ffmpeg and ffprobe binaries exist and are executable
 * @returns {{ ffmpegPath: string, ffprobePath: string }} Paths to both binaries
 * @throws {Error} If either binary is not found
 */
export function validateFfmpegBinaries() {
  const ffmpegPath = getFfmpegPath();
  const ffprobePath = getFfprobePath();

  // Check if files exist (already done in get functions, but double-check)
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg binary not found at: ${ffmpegPath}`);
  }

  if (!fs.existsSync(ffprobePath)) {
    throw new Error(`FFprobe binary not found at: ${ffprobePath}`);
  }

  return { ffmpegPath, ffprobePath };
}
