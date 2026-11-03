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

export interface FfmpegEnvironment {
  isPackaged: boolean;
  resourcesPath: string;
}

/**
 * Binary paths for FFmpeg components
 */
interface FfmpegBinaryPaths {
  ffmpegPath: string;
  ffprobePath: string | null;
}

interface BinaryResolutionConfig {
  readonly binaryLabel: string;
  readonly envVarName: string;
  readonly executableBaseName: string;
  readonly packageName: string;
  readonly loadPackage: () => unknown;
  readonly nestedSegments: (platform: NodeJS.Platform, archDir: string) => readonly string[];
  readonly readPackageExport: (packageExport: unknown) => string | null;
}

function resolveBinaryPath(config: BinaryResolutionConfig, environment: FfmpegEnvironment): string {
  const { isPackaged, resourcesPath } = environment;
  const platform = process.platform;
  const archDir = process.arch === 'arm64' ? 'arm64' : 'x64';
  const executableName = platform === 'win32' ? `${config.executableBaseName}.exe` : config.executableBaseName;
  const nestedSegments = config.nestedSegments(platform, archDir);

  const envPath = process.env[config.envVarName];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  if (isPackaged) {
    // In packaged app, binaries are unpacked to app.asar.unpacked
    const unpackedPath = path.join(
      resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      config.packageName,
      ...nestedSegments,
      executableName
    );

    if (fs.existsSync(unpackedPath)) {
      return unpackedPath;
    }

    // Fallback: try without .asar.unpacked (some build configs)
    const fallbackPath = path.join(
      resourcesPath,
      'node_modules',
      config.packageName,
      ...nestedSegments,
      executableName
    );

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  // Development mode: use the npm package directly
  try {
    const packageExport = config.loadPackage();
    const resolvedFromPackage = config.readPackageExport(packageExport);
    if (resolvedFromPackage && fs.existsSync(resolvedFromPackage)) {
      return resolvedFromPackage;
    }
  } catch {
    // Try manual path resolution as fallback
  }

  // Manual fallback path
  const manualPath = path.join(process.cwd(), 'node_modules', config.packageName, ...nestedSegments, executableName);

  if (fs.existsSync(manualPath)) {
    return manualPath;
  }

  const systemPath = resolveSystemBinary(config.executableBaseName);
  if (systemPath) {
    return systemPath;
  }

  throw new Error(`${config.binaryLabel} binary not found. Platform: ${platform}, Packaged: ${isPackaged}`);
}

/**
 * Get the path to the ffmpeg binary
 * @returns Absolute path to ffmpeg executable
 */
export function getFfmpegPath(environment: FfmpegEnvironment): string {
  return resolveBinaryPath({
    binaryLabel: 'FFmpeg',
    envVarName: 'FFMPEG_PATH',
    executableBaseName: 'ffmpeg',
    packageName: 'ffmpeg-static',
    loadPackage: () => require('ffmpeg-static'),
    nestedSegments: () => [],
    readPackageExport: (packageExport) => (typeof packageExport === 'string' ? packageExport : null)
  }, environment);
}

/**
 * Get the path to the ffprobe binary
 * @returns Absolute path to ffprobe executable
 */
export function getFfprobePath(environment: FfmpegEnvironment): string {
  return resolveBinaryPath({
    binaryLabel: 'FFprobe',
    envVarName: 'FFPROBE_PATH',
    executableBaseName: 'ffprobe',
    packageName: 'ffprobe-static',
    loadPackage: () => require('ffprobe-static'),
    // ffprobe-static lays its binaries out at bin/<platform>/<arch>, unlike ffmpeg-static's flat layout
    nestedSegments: (platform, archDir) => ['bin', platform, archDir],
    readPackageExport: (packageExport) => {
      const candidate = (packageExport as { path?: unknown } | null | undefined)?.path;
      return typeof candidate === 'string' ? candidate : null;
    }
  }, environment);
}

/**
 * Get the path to the ffprobe binary if available
 * @returns Absolute path to ffprobe executable or null
 */
export function getOptionalFfprobePath(environment: FfmpegEnvironment): string | null {
  try {
    return getFfprobePath(environment);
  } catch {
    return null;
  }
}

/**
 * Validate that both ffmpeg and ffprobe binaries exist and are executable
 * @returns Paths to both binaries
 * @throws Error if either binary is not found
 */
export function validateFfmpegBinaries(environment: FfmpegEnvironment): FfmpegBinaryPaths {
  const ffmpegPath = getFfmpegPath(environment);
  const ffprobePath = getOptionalFfprobePath(environment);

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
