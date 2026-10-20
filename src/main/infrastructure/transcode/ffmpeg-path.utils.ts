import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);

interface BinaryResolutionConfig {
  readonly binaryLabel: string;
  readonly envVarName: string;
  readonly executableBaseName: string;
  readonly packageName: string;
  readonly nestedSegments: (platform: NodeJS.Platform, archDir: string) => readonly string[];
  readonly readPackageExport: (packageExport: unknown) => string | null;
}

function resolveBinaryPath(config: BinaryResolutionConfig): string {
  const isPackaged = app.isPackaged;
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
      process.resourcesPath,
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
      process.resourcesPath,
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
    const packageExport = require(config.packageName);
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

export function getFfmpegPath(): string {
  return resolveBinaryPath({
    binaryLabel: 'FFmpeg',
    envVarName: 'FFMPEG_PATH',
    executableBaseName: 'ffmpeg',
    packageName: 'ffmpeg-static',
    nestedSegments: () => [],
    readPackageExport: (packageExport) => (typeof packageExport === 'string' ? packageExport : null)
  });
}

export function getFfprobePath(): string {
  return resolveBinaryPath({
    binaryLabel: 'FFprobe',
    envVarName: 'FFPROBE_PATH',
    executableBaseName: 'ffprobe',
    packageName: 'ffprobe-static',
    // ffprobe-static lays its binaries out at bin/<platform>/<arch>, unlike ffmpeg-static's flat layout
    nestedSegments: (platform, archDir) => ['bin', platform, archDir],
    readPackageExport: (packageExport) => {
      const candidate = (packageExport as { path?: unknown } | null | undefined)?.path;
      return typeof candidate === 'string' ? candidate : null;
    }
  });
}

export function getOptionalFfprobePath(): string | null {
  try {
    return getFfprobePath();
  } catch {
    return null;
  }
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
