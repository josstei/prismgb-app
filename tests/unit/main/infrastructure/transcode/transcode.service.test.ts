import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createLoggerFactory } from '../../../../factories/index.js';

interface FakeTranscodeProcess extends EventEmitter {
  readonly constructorArgs: unknown[];
  readonly start: ReturnType<typeof vi.fn>;
  readonly cancel: ReturnType<typeof vi.fn>;
}

const { appPaths, createdProcesses, ffmpegPaths } = vi.hoisted(() => ({
  appPaths: { temp: '', downloads: '' },
  createdProcesses: [] as FakeTranscodeProcess[],
  ffmpegPaths: {
    getFfmpegPath: vi.fn(() => '/bin/ffmpeg'),
    getOptionalFfprobePath: vi.fn((): string | null => '/bin/ffprobe')
  }
}));

vi.mock('electron', () => ({
  app: { getPath: vi.fn((name: 'temp' | 'downloads') => appPaths[name]) }
}));

vi.mock('@main/infrastructure/transcode/ffmpeg-path.utils', () => ffmpegPaths);

vi.mock('@main/infrastructure/transcode/transcode-process', async () => {
  const { EventEmitter: Emitter } = await import('node:events');

  class TranscodeProcessFake extends Emitter {
    readonly constructorArgs: unknown[];
    private completion: Promise<void> = Promise.resolve();
    private rejectCompletion: (error: Error) => void = () => {};

    readonly start = vi.fn(() => {
      this.completion = new Promise<void>((_resolve, reject) => {
        this.rejectCompletion = reject;
      });
      return this.completion;
    });

    readonly cancel = vi.fn(() => {
      this.emit('cancelled');
      this.rejectCompletion(new Error('Transcode cancelled'));
    });

    constructor(...args: unknown[]) {
      super();
      this.constructorArgs = args;
      createdProcesses.push(this);
    }

    waitForExit(): Promise<void> {
      return this.completion;
    }
  }

  return {
    TranscodeProcess: TranscodeProcessFake,
    probeDuration: vi.fn(async () => 5_000_000)
  };
});

import { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';

describe('TranscodeService (main)', () => {
  let sandbox: string;
  let ipcPushBridge: IpcPushBridge;
  let loggerFactory: ReturnType<typeof createLoggerFactory>;
  let service: TranscodeService;

  const logger = () => loggerFactory._getLogger('TranscodeService');
  const tempRoot = () => path.join(appPaths.temp, 'prismgb-transcode');
  const lastProcess = () => createdProcesses.at(-1) as FakeTranscodeProcess;
  const request = (overrides: Record<string, unknown> = {}) => ({
    inputBuffer: Buffer.from('webm-bytes'),
    format: 'mp4' as const,
    outputFilename: 'prismgb-recording-20260101-120000-000',
    ...overrides
  });

  beforeEach(() => {
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-transcode-test-'));
    appPaths.temp = path.join(sandbox, 'temp');
    appPaths.downloads = path.join(sandbox, 'downloads');
    fs.mkdirSync(appPaths.downloads, { recursive: true });
    createdProcesses.length = 0;
    loggerFactory = createLoggerFactory();
    ipcPushBridge = new IpcPushBridge(loggerFactory);
    vi.spyOn(ipcPushBridge, 'emit');
    service = new TranscodeService(ipcPushBridge, loggerFactory);
  });

  afterEach(() => {
    fs.rmSync(sandbox, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('logs the resolved ffmpeg binaries', () => {
      service.initialize();

      expect(logger().info).toHaveBeenCalledWith('FFmpeg binaries validated', {
        ffmpegPath: '/bin/ffmpeg',
        ffprobePath: '/bin/ffprobe'
      });
    });

    it('reports a missing ffprobe as optional', () => {
      ffmpegPaths.getOptionalFfprobePath.mockReturnValueOnce(null);

      service.initialize();

      expect(logger().info).toHaveBeenCalledWith('FFmpeg binaries validated', {
        ffmpegPath: '/bin/ffmpeg',
        ffprobePath: 'optional-missing'
      });
    });

    it('logs and continues when ffmpeg is missing', () => {
      ffmpegPaths.getFfmpegPath.mockImplementationOnce(() => {
        throw new Error('ffmpeg missing');
      });

      expect(() => service.initialize()).not.toThrow();
      expect(logger().error).toHaveBeenCalledWith('FFmpeg binary not found', { error: 'ffmpeg missing' });
      expect(logger().info).toHaveBeenCalledWith('TranscodeService initialized');
    });
  });

  describe('request validation', () => {
    it('rejects an unsupported format with the user-facing message', async () => {
      await expect(service.transcode(request({ format: 'avi' }) as never)).rejects.toThrow('Unsupported format: avi');
      expect(createdProcesses).toHaveLength(0);
    });

    it('rejects a missing output filename with the user-facing message', async () => {
      await expect(service.transcode(request({ outputFilename: undefined }))).rejects.toThrow('Output filename is required');
      await expect(service.transcode(request({ outputFilename: '' }))).rejects.toThrow('Output filename is required');
      expect(createdProcesses).toHaveLength(0);
    });
  });

  describe('format table', () => {
    it.each([
      ['webm', 'libvpx-vp9', ['-c:v', 'libvpx-vp9', '-crf', '30', '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k']],
      ['mp4', 'libx264', ['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart']],
      ['mov', 'prores_ks', ['-c:v', 'prores_ks', '-profile:v', '1', '-c:a', 'pcm_s16le']]
    ] as const)('encodes %s with %s into Downloads/<name>.%s', async (format, _codec, ffmpegArgs) => {
      await service.transcode(request({ format }));

      const [inputPath, outputPath, args, durationUs] = lastProcess().constructorArgs;
      expect(path.basename(inputPath as string)).toBe('input.webm');
      expect(outputPath).toBe(path.join(appPaths.downloads, `prismgb-recording-20260101-120000-000.${format}`));
      expect(args).toEqual(ffmpegArgs);
      expect(durationUs).toBe(5_000_000);
    });
  });

  describe('transcode', () => {
    it('writes the input into a fresh session dir and resolves its id as the job id', async () => {
      const jobId = await service.transcode(request());

      expect(jobId).toMatch(/^prismgb-transcode-\d+-[0-9a-f]{8}$/);
      const inputPath = lastProcess().constructorArgs[0] as string;
      expect(inputPath).toBe(path.join(tempRoot(), jobId, 'input.webm'));
      expect(fs.readFileSync(inputPath, 'utf8')).toBe('webm-bytes');
      expect(lastProcess().start).toHaveBeenCalledTimes(1);
    });

    it('applies the recovery input flags only to interrupted recordings', async () => {
      await service.transcode(request());
      expect(lastProcess().constructorArgs[4]).toEqual([]);

      await service.transcode(request({ interrupted: true }));
      expect(lastProcess().constructorArgs[4]).toEqual(['-fflags', '+genpts', '-err_detect', 'ignore_err']);
    });

    it('rethrows a startup failure after removing the session dir', async () => {
      const writeFile = vi.spyOn(fs.promises, 'writeFile').mockRejectedValueOnce(new Error('disk full'));

      await expect(service.transcode(request())).rejects.toThrow('disk full');

      expect(fs.readdirSync(tempRoot())).toEqual([]);
      expect(logger().error).toHaveBeenCalledWith('Failed to start transcode', expect.objectContaining({ error: 'disk full' }));
      expect(createdProcesses).toHaveLength(0);
      writeFile.mockRestore();
    });
  });

  describe('job events', () => {
    it('relays progress with the job id', async () => {
      const jobId = await service.transcode(request());

      lastProcess().emit('progress', { percent: 42.5, timeUs: 1000, elapsedMs: 50 });

      expect(ipcPushBridge.emit).toHaveBeenCalledWith('transcode:progress', { jobId, percent: 42.5, timeUs: 1000, elapsedMs: 50 });
    });

    it('publishes completion with the output path and keeps the output file', async () => {
      const jobId = await service.transcode(request());
      const outputPath = lastProcess().constructorArgs[1] as string;
      fs.writeFileSync(outputPath, 'mp4-bytes');

      lastProcess().emit('completed');

      expect(ipcPushBridge.emit).toHaveBeenCalledWith('transcode:completed', { jobId, filePath: outputPath });
      expect(fs.existsSync(path.join(tempRoot(), jobId))).toBe(false);
      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('publishes the error message and removes the partial output', async () => {
      const jobId = await service.transcode(request());
      const outputPath = lastProcess().constructorArgs[1] as string;
      fs.writeFileSync(outputPath, 'partial');

      lastProcess().emit('error', new Error('Invalid data found when processing input'));

      expect(ipcPushBridge.emit).toHaveBeenCalledWith('transcode:error', {
        jobId,
        error: 'Invalid data found when processing input'
      });
      expect(fs.existsSync(path.join(tempRoot(), jobId))).toBe(false);
      expect(fs.existsSync(outputPath)).toBe(false);
    });

    it('keeps working when the renderer push fails', async () => {
      ipcPushBridge.on('transcode:progress', () => {
        throw new Error('window gone');
      });
      await service.transcode(request());

      expect(() => lastProcess().emit('progress', { percent: 1, timeUs: 1 })).not.toThrow();
      expect(loggerFactory._getLogger('IpcPushBridge').warn).toHaveBeenCalledWith(
        'Failed to deliver push',
        { channel: 'transcode:progress', error: 'window gone' }
      );
    });
  });

  describe('dispose', () => {
    it('cancels running jobs, removes their files and sweeps orphaned session dirs', async () => {
      const jobId = await service.transcode(request());
      const outputPath = lastProcess().constructorArgs[1] as string;
      fs.writeFileSync(outputPath, 'partial');
      fs.mkdirSync(path.join(tempRoot(), 'prismgb-transcode-1-deadbeef'));

      await service.dispose();

      expect(lastProcess().cancel).toHaveBeenCalledTimes(1);
      expect(ipcPushBridge.emit).toHaveBeenCalledWith('transcode:cancelled', { jobId });
      expect(fs.existsSync(outputPath)).toBe(false);
      expect(fs.existsSync(tempRoot())).toBe(false);
    });

    it('leaves unrelated entries in the temp root alone', async () => {
      fs.mkdirSync(path.join(tempRoot(), 'prismgb-transcode-2-cafebabe'), { recursive: true });
      fs.writeFileSync(path.join(tempRoot(), 'keep.txt'), 'x');

      await service.dispose();

      expect(fs.readdirSync(tempRoot())).toEqual(['keep.txt']);
    });
  });
});
