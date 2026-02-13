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
import { execSync } from 'node:child_process';

// Create require for CommonJS module resolution
const require = createRequire(import.meta.url);

/**
 * Binary paths for FFmpeg components
 */
export interface FfmpegBinaryPaths {
  ffmpegPath: string;
  ffprobePath: string | null;
}

/**
 * Configuration for binary resolution
 */
interface BinaryResolutionConfig {
  envVar: string;
  moduleName: string;
  modulePathProperty?: string;
  subdirectories?: string[];
  binaryName: string;
  friendlyName: string;
}

/**
 * Resolve a binary path using a standardized fallback chain
 * @param config Configuration for binary resolution
 * @returns Absolute path to the binary
 * @throws Error if binary cannot be resolved
 */
function _resolveBinary(config: BinaryResolutionConfig): string {
  const isPackaged = app.isPackaged;
  const platform = process.platform;
  const executableName = platform === 'win32' ? `${config.binaryName}.exe` : config.binaryName;

  // Step 1: Check environment variable
  const envPath = process.env[config.envVar];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  const modulePath = config.subdirectories || [];

  // Step 2: Check packaged app locations
  if (isPackaged) {
    // Try app.asar.unpacked location
    const unpackedPath = path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      config.moduleName,
      ...modulePath,
      executableName
    );

    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }

    // Fallback: try without .asar.unpacked
    const fallbackPath = path.join(
      process.resourcesPath,
      'node_modules',
      config.moduleName,
      ...modulePath,
      executableName
    );

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  // Step 3: Check npm package export
  try {
    const moduleExport = require(config.moduleName);
    const exportedPath = config.modulePathProperty
      ? moduleExport[config.modulePathProperty]
      : moduleExport;

    if (exportedPath && fs.existsSync(exportedPath)) {
      return exportedPath;
    }
  } catch {
    // Continue to manual resolution
  }

  // Manual fallback: construct path to node_modules
  const manualPath = path.join(
    process.cwd(),
    'node_modules',
    config.moduleName,
    ...modulePath,
    executableName
  );

  if (fs.existsSync(manualPath)) {
    return manualPath;
  }

  // Step 4: Check system PATH
  const systemPath = resolveSystemBinary(config.binaryName);
  if (systemPath) {
    return systemPath;
  }

  throw new Error(
    `${config.friendlyName} binary not found. Platform: ${platform}, Packaged: ${isPackaged}`
  );
}

/**
 * Get the path to the ffmpeg binary
 * @returns Absolute path to ffmpeg executable
 */
export function getFfmpegPath(): string {
  return _resolveBinary({
    envVar: 'FFMPEG_PATH',
    moduleName: 'ffmpeg-static',
    binaryName: 'ffmpeg',
    friendlyName: 'FFmpeg',
  });
}

/**
 * Get the path to the ffprobe binary
 * @returns Absolute path to ffprobe executable
 */
export function getFfprobePath(): string {
  const platform = process.platform;
  const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';

  return _resolveBinary({
    envVar: 'FFPROBE_PATH',
    moduleName: 'ffprobe-static',
    modulePathProperty: 'path',
    subdirectories: ['bin', platform, archDir],
    binaryName: 'ffprobe',
    friendlyName: 'FFprobe',
  });
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
