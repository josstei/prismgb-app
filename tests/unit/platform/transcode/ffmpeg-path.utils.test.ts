import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

type FfmpegPathModule = typeof import('../../../../src/platform/transcode/ffmpeg-path.utils.js');

const require = createRequire(import.meta.url);
const REAL_FFMPEG_STATIC_PATH: string = require('ffmpeg-static');
const REAL_FFPROBE_STATIC_EXPORT: { path: string } = require('ffprobe-static');

const ORIGINAL_PLATFORM = process.platform;
const ORIGINAL_ARCH = process.arch;
const ORIGINAL_RESOURCES_PATH = (process as unknown as { resourcesPath?: string }).resourcesPath;
const ORIGINAL_FFMPEG_ENV = process.env.FFMPEG_PATH;
const ORIGINAL_FFPROBE_ENV = process.env.FFPROBE_PATH;

interface LoadOptions {
  electronApp?: { isPackaged: boolean } | null;
  platform?: NodeJS.Platform;
  arch?: NodeJS.Architecture;
  resourcesPath?: string;
  cwd?: string;
  env?: { FFMPEG_PATH?: string; FFPROBE_PATH?: string };
  requireImpl?: (specifier: string) => unknown;
  existsSyncImpl?: (candidate: string) => boolean;
  execSyncImpl?: (command: string) => string;
}

function restoreProcessGlobals(): void {
  Object.defineProperty(process, 'platform', { value: ORIGINAL_PLATFORM, configurable: true });
  Object.defineProperty(process, 'arch', { value: ORIGINAL_ARCH, configurable: true });
  Object.defineProperty(process, 'resourcesPath', { value: ORIGINAL_RESOURCES_PATH, configurable: true });

  if (ORIGINAL_FFMPEG_ENV === undefined) delete process.env.FFMPEG_PATH;
  else process.env.FFMPEG_PATH = ORIGINAL_FFMPEG_ENV;

  if (ORIGINAL_FFPROBE_ENV === undefined) delete process.env.FFPROBE_PATH;
  else process.env.FFPROBE_PATH = ORIGINAL_FFPROBE_ENV;
}

async function loadFfmpegPathUtils(options: LoadOptions = {}): Promise<FfmpegPathModule> {
  vi.resetModules();

  Object.defineProperty(process, 'platform', { value: options.platform ?? 'darwin', configurable: true });
  Object.defineProperty(process, 'arch', { value: options.arch ?? 'x64', configurable: true });
  Object.defineProperty(process, 'resourcesPath', {
    value: options.resourcesPath ?? '/mock/resources',
    configurable: true
  });

  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;
  if (options.env?.FFMPEG_PATH !== undefined) process.env.FFMPEG_PATH = options.env.FFMPEG_PATH;
  if (options.env?.FFPROBE_PATH !== undefined) process.env.FFPROBE_PATH = options.env.FFPROBE_PATH;

  vi.spyOn(process, 'cwd').mockReturnValue(options.cwd ?? '/mock/cwd');

  const electronRequireMock = vi.fn((specifier: string) => {
    if (specifier !== 'electron') throw new Error(`Cannot find module '${specifier}'`);
    if (!options.electronApp) throw new Error('Cannot find module electron');
    return { app: options.electronApp };
  });
  vi.spyOn(process, 'getBuiltinModule').mockImplementation(((id: string) => {
    if (id === 'node:module') return { createRequire: () => electronRequireMock };
    return undefined;
  }) as never);

  const packageRequireMock = vi.fn((specifier: string) => {
    if (options.requireImpl) return options.requireImpl(specifier);
    throw new Error(`Cannot find module '${specifier}'`);
  });
  vi.doMock('node:module', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:module')>();
    return { ...actual, createRequire: () => packageRequireMock };
  });

  const existsSyncImpl = options.existsSyncImpl ?? (() => false);
  vi.doMock('node:fs', async (importOriginal) => {
    const actual = (await importOriginal<typeof import('node:fs')>()) as unknown as Record<string, unknown>;
    return { ...actual, default: { ...actual.default as object, existsSync: existsSyncImpl }, existsSync: existsSyncImpl };
  });

  const execSyncImpl =
    options.execSyncImpl ??
    (() => {
      throw new Error('command not found');
    });
  vi.doMock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process')>();
    return { ...actual, execSync: execSyncImpl };
  });

  return import('../../../../src/platform/transcode/ffmpeg-path.utils.js');
}

describe('ffmpeg-path.utils (characterization)', () => {
  afterEach(() => {
    restoreProcessGlobals();
  });

  describe('getFfmpegPath — env var resolution', () => {
    it('returns FFMPEG_PATH directly when it exists on disk', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        env: { FFMPEG_PATH: '/env/ffmpeg' },
        existsSyncImpl: (candidate) => candidate === '/env/ffmpeg'
      });

      expect(getFfmpegPath()).toBe('/env/ffmpeg');
    });

    it('ignores FFMPEG_PATH when the file does not exist and falls through', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        env: { FFMPEG_PATH: '/env/missing-ffmpeg' },
        electronApp: null,
        requireImpl: () => REAL_FFMPEG_STATIC_PATH,
        existsSyncImpl: (candidate) => candidate === REAL_FFMPEG_STATIC_PATH
      });

      expect(getFfmpegPath()).toBe(REAL_FFMPEG_STATIC_PATH);
    });
  });

  describe('getFfprobePath — env var resolution', () => {
    it('returns FFPROBE_PATH directly when it exists on disk', async () => {
      const { getFfprobePath } = await loadFfmpegPathUtils({
        env: { FFPROBE_PATH: '/env/ffprobe' },
        existsSyncImpl: (candidate) => candidate === '/env/ffprobe'
      });

      expect(getFfprobePath()).toBe('/env/ffprobe');
    });

    it('ignores FFPROBE_PATH when the file does not exist and falls through', async () => {
      const { getFfprobePath } = await loadFfmpegPathUtils({
        env: { FFPROBE_PATH: '/env/missing-ffprobe' },
        electronApp: null,
        requireImpl: (specifier) => (specifier === 'ffprobe-static' ? REAL_FFPROBE_STATIC_EXPORT : undefined),
        existsSyncImpl: (candidate) => candidate === REAL_FFPROBE_STATIC_EXPORT.path
      });

      expect(getFfprobePath()).toBe(REAL_FFPROBE_STATIC_EXPORT.path);
    });
  });

  describe('getFfmpegPath — packaged mode', () => {
    it('resolves the app.asar.unpacked path when it exists', async () => {
      const expected = path.join(
        '/packaged/resources',
        'app.asar.unpacked',
        'node_modules',
        'ffmpeg-static',
        'ffmpeg'
      );
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === expected
      });

      expect(getFfmpegPath()).toBe(expected);
    });

    it('falls back to the non-unpacked resources path when unpacked is absent', async () => {
      const fallback = path.join('/packaged/resources', 'node_modules', 'ffmpeg-static', 'ffmpeg');
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === fallback
      });

      expect(getFfmpegPath()).toBe(fallback);
    });

    it('uses the .exe suffix on win32', async () => {
      const expected = path.join(
        '/packaged/resources',
        'app.asar.unpacked',
        'node_modules',
        'ffmpeg-static',
        'ffmpeg.exe'
      );
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        platform: 'win32',
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === expected
      });

      expect(getFfmpegPath()).toBe(expected);
    });
  });

  describe('getFfprobePath — packaged mode (nested bin/<platform>/<arch> layout)', () => {
    it('resolves the nested app.asar.unpacked path when it exists', async () => {
      const expected = path.join(
        '/packaged/resources',
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        'bin',
        'darwin',
        'arm64',
        'ffprobe'
      );
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        arch: 'arm64',
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === expected
      });

      expect(getFfprobePath()).toBe(expected);
    });

    it('falls back to the non-unpacked nested resources path when unpacked is absent', async () => {
      const fallback = path.join(
        '/packaged/resources',
        'node_modules',
        'ffprobe-static',
        'bin',
        'darwin',
        'x64',
        'ffprobe'
      );
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        arch: 'x64',
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === fallback
      });

      expect(getFfprobePath()).toBe(fallback);
    });

    it('defaults the arch directory to x64 for non-arm64 architectures', async () => {
      const expected = path.join(
        '/packaged/resources',
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        'bin',
        'darwin',
        'x64',
        'ffprobe'
      );
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        arch: 'ia32',
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === expected
      });

      expect(getFfprobePath()).toBe(expected);
    });

    it('uses the .exe suffix and win32 bin directory on win32', async () => {
      const expected = path.join(
        '/packaged/resources',
        'app.asar.unpacked',
        'node_modules',
        'ffprobe-static',
        'bin',
        'win32',
        'x64',
        'ffprobe.exe'
      );
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        platform: 'win32',
        resourcesPath: '/packaged/resources',
        existsSyncImpl: (candidate) => candidate === expected
      });

      expect(getFfprobePath()).toBe(expected);
    });
  });

  describe('dev-mode package export shape divergence', () => {
    it('uses the real ffmpeg-static export as a flat string path', () => {
      expect(typeof REAL_FFMPEG_STATIC_PATH).toBe('string');
    });

    it('uses the real ffprobe-static export as a {path} object', () => {
      expect(typeof REAL_FFPROBE_STATIC_EXPORT).toBe('object');
      expect(typeof REAL_FFPROBE_STATIC_EXPORT.path).toBe('string');
    });

    it('getFfmpegPath resolves the flat-string ffmpeg-static export directly', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        requireImpl: (specifier) => (specifier === 'ffmpeg-static' ? REAL_FFMPEG_STATIC_PATH : undefined),
        existsSyncImpl: (candidate) => candidate === REAL_FFMPEG_STATIC_PATH
      });

      expect(getFfmpegPath()).toBe(REAL_FFMPEG_STATIC_PATH);
    });

    it('getFfprobePath resolves the .path property of the ffprobe-static export', async () => {
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: null,
        requireImpl: (specifier) => (specifier === 'ffprobe-static' ? REAL_FFPROBE_STATIC_EXPORT : undefined),
        existsSyncImpl: (candidate) => candidate === REAL_FFPROBE_STATIC_EXPORT.path
      });

      expect(getFfprobePath()).toBe(REAL_FFPROBE_STATIC_EXPORT.path);
    });

    it('falls through to manual resolution when the required path does not exist on disk', async () => {
      const manualPath = path.join('/mock/cwd', 'node_modules', 'ffmpeg-static', 'ffmpeg');
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        requireImpl: (specifier) => (specifier === 'ffmpeg-static' ? REAL_FFMPEG_STATIC_PATH : undefined),
        existsSyncImpl: (candidate) => candidate === manualPath
      });

      expect(getFfmpegPath()).toBe(manualPath);
    });

    it('falls through to manual resolution when require throws (package unavailable)', async () => {
      const manualPath = path.join('/mock/cwd', 'node_modules', 'ffmpeg-static', 'ffmpeg');
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        requireImpl: () => {
          throw new Error("Cannot find module 'ffmpeg-static'");
        },
        existsSyncImpl: (candidate) => candidate === manualPath
      });

      expect(getFfmpegPath()).toBe(manualPath);
    });
  });

  describe('manual fallback resolution', () => {
    it('resolves ffmpeg from cwd/node_modules when nothing else matches', async () => {
      const manualPath = path.join('/mock/cwd', 'node_modules', 'ffmpeg-static', 'ffmpeg');
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        existsSyncImpl: (candidate) => candidate === manualPath
      });

      expect(getFfmpegPath()).toBe(manualPath);
    });

    it('resolves ffprobe from cwd/node_modules/bin/<platform>/<arch> when nothing else matches', async () => {
      const manualPath = path.join(
        '/mock/cwd',
        'node_modules',
        'ffprobe-static',
        'bin',
        'darwin',
        'arm64',
        'ffprobe'
      );
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: null,
        arch: 'arm64',
        existsSyncImpl: (candidate) => candidate === manualPath
      });

      expect(getFfprobePath()).toBe(manualPath);
    });
  });

  describe('system binary fallback', () => {
    it('resolves ffmpeg via `command -v` when no other candidate matches', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        existsSyncImpl: (candidate) => candidate === '/usr/local/bin/ffmpeg',
        execSyncImpl: (command) => (command === 'command -v ffmpeg' ? '/usr/local/bin/ffmpeg\n' : '')
      });

      expect(getFfmpegPath()).toBe('/usr/local/bin/ffmpeg');
    });

    it('resolves ffprobe via `command -v` when no other candidate matches', async () => {
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: null,
        existsSyncImpl: (candidate) => candidate === '/usr/local/bin/ffprobe',
        execSyncImpl: (command) => (command === 'command -v ffprobe' ? '/usr/local/bin/ffprobe\n' : '')
      });

      expect(getFfprobePath()).toBe('/usr/local/bin/ffprobe');
    });

    it('ignores a system binary result that does not exist on disk', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: null,
        existsSyncImpl: () => false,
        execSyncImpl: () => '/usr/local/bin/ffmpeg\n'
      });

      expect(() => getFfmpegPath()).toThrow(/FFmpeg binary not found/);
    });
  });

  describe('distinct error texts when resolution is exhausted', () => {
    it('throws an FFmpeg-specific message including platform and packaged state', async () => {
      const { getFfmpegPath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: true },
        platform: 'linux',
        existsSyncImpl: () => false
      });

      expect(() => getFfmpegPath()).toThrow('FFmpeg binary not found. Platform: linux, Packaged: true');
    });

    it('throws an FFprobe-specific message including platform and packaged state', async () => {
      const { getFfprobePath } = await loadFfmpegPathUtils({
        electronApp: { isPackaged: false },
        platform: 'linux',
        existsSyncImpl: () => false
      });

      expect(() => getFfprobePath()).toThrow('FFprobe binary not found. Platform: linux, Packaged: false');
    });
  });

  describe('getOptionalFfprobePath', () => {
    it('returns the resolved path when ffprobe resolution succeeds', async () => {
      const { getOptionalFfprobePath } = await loadFfmpegPathUtils({
        env: { FFPROBE_PATH: '/env/ffprobe' },
        existsSyncImpl: (candidate) => candidate === '/env/ffprobe'
      });

      expect(getOptionalFfprobePath()).toBe('/env/ffprobe');
    });

    it('returns null when ffprobe resolution throws', async () => {
      const { getOptionalFfprobePath } = await loadFfmpegPathUtils({
        electronApp: null,
        existsSyncImpl: () => false
      });

      expect(getOptionalFfprobePath()).toBeNull();
    });
  });

  describe('validateFfmpegBinaries', () => {
    it('returns both resolved paths when ffmpeg exists', async () => {
      const { validateFfmpegBinaries } = await loadFfmpegPathUtils({
        env: { FFMPEG_PATH: '/env/ffmpeg', FFPROBE_PATH: '/env/ffprobe' },
        existsSyncImpl: (candidate) => candidate === '/env/ffmpeg' || candidate === '/env/ffprobe'
      });

      expect(validateFfmpegBinaries()).toEqual({ ffmpegPath: '/env/ffmpeg', ffprobePath: '/env/ffprobe' });
    });

    it('tolerates ffprobe resolution failure and reports a null ffprobePath', async () => {
      const { validateFfmpegBinaries } = await loadFfmpegPathUtils({
        env: { FFMPEG_PATH: '/env/ffmpeg' },
        existsSyncImpl: (candidate) => candidate === '/env/ffmpeg'
      });

      expect(validateFfmpegBinaries()).toEqual({ ffmpegPath: '/env/ffmpeg', ffprobePath: null });
    });

    it('throws its own not-found message when the resolved ffmpeg path vanishes before the re-check', async () => {
      let ffmpegPathCheckCount = 0;
      const { validateFfmpegBinaries } = await loadFfmpegPathUtils({
        env: { FFMPEG_PATH: '/env/ffmpeg' },
        existsSyncImpl: (candidate) => {
          if (candidate !== '/env/ffmpeg') return false;
          ffmpegPathCheckCount += 1;
          return ffmpegPathCheckCount === 1;
        }
      });

      expect(() => validateFfmpegBinaries()).toThrow('FFmpeg binary not found at: /env/ffmpeg');
    });
  });
});
