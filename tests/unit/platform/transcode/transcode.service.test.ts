import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TranscodeService } from '@platform/transcode/service';
import { TranscodeProcess, probeDuration } from '../../../../src/platform/transcode/transcode-process.js';
import { createLoggerFactory } from '../../../factories/index.js';

vi.mock('../../../../src/platform/transcode/ffmpeg-path.utils.js', () => ({
  getFfmpegPath: () => '/fake/ffmpeg',
  getOptionalFfprobePath: () => null,
  validateFfmpegBinaries: () => ({ ffmpegPath: '/fake/ffmpeg', ffprobePath: null })
}));
vi.mock('../../../../src/platform/transcode/transcode-process.js', async () => {
  const { EventEmitter } = await import('node:events');
  class ControlledProcess extends EventEmitter {
    static instances: ControlledProcess[] = [];
    isRunning = false;
    private resolveExit!: () => void;
    private readonly exit = new Promise<void>((resolve) => { this.resolveExit = resolve; });
    constructor(readonly inputPath: string, readonly outputPath: string, readonly args: string[], readonly duration: number, readonly inputArgs: string[]) {
      super();
      ControlledProcess.instances.push(this);
    }
    start(): Promise<void> { this.isRunning = true; return this.exit; }
    finish(event: 'completed' | 'cancelled' | 'error'): void {
      this.isRunning = false;
      this.emit(event, event === 'error' ? new Error('encoder failure') : undefined);
      this.resolveExit();
    }
    cancel(): void { this.finish('cancelled'); }
    waitForExit(): Promise<void> { return this.exit; }
  }
  return { TranscodeProcess: ControlledProcess, probeDuration: vi.fn(async () => 250000) };
});

type ControlledProcess = {
  inputPath: string;
  outputPath: string;
  inputArgs: string[];
  finish(event: 'completed' | 'cancelled' | 'error'): void;
};
const processes = TranscodeProcess as unknown as { instances: ControlledProcess[] };

describe('main TranscodeService ownership', () => {
  let directory: string;
  let service: TranscodeService;
  const pushPublisher = { emit: vi.fn() };
  const options = { inputBuffer: Buffer.from('input'), format: 'mp4' as const, outputFilename: 'recording' };

  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-transcode-test-'));
    processes.instances.length = 0;
    vi.mocked(probeDuration).mockResolvedValue(250000);
    service = new TranscodeService({
      pushPublisher,
      loggerFactory: createLoggerFactory(),
      environment: { downloadsDir: directory, tempDir: directory, isPackaged: false, resourcesPath: '' }
    });
    await service.initialize();
  });
  afterEach(async () => { await service.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });

  it('preserves successful output, removes temporary input, and releases the completed job', async () => {
    const { jobId } = await service.transcode(options);
    const process = processes.instances[0]!;
    expect(fs.readFileSync(process.inputPath)).toEqual(options.inputBuffer);
    fs.writeFileSync(process.outputPath, 'encoded');
    process.finish('completed');
    expect(pushPublisher.emit).toHaveBeenCalledWith('transcode:completed', { jobId, filePath: process.outputPath });
    expect(fs.readFileSync(process.outputPath, 'utf8')).toBe('encoded');
    expect(fs.existsSync(path.dirname(process.inputPath))).toBe(false);
    expect(() => service.cancel(jobId)).toThrow('Job not found or already completed');
  });

  it.each(['cancelled', 'error'] as const)('removes partial output and temporary input on %s', async (event) => {
    const { jobId } = await service.transcode(options);
    const process = processes.instances[0]!;
    fs.writeFileSync(process.outputPath, 'partial');
    if (event === 'cancelled') service.cancel(jobId); else process.finish('error');
    expect(pushPublisher.emit).toHaveBeenCalledWith(`transcode:${event}`, expect.objectContaining({ jobId }));
    expect(fs.existsSync(process.outputPath)).toBe(false);
    expect(fs.existsSync(path.dirname(process.inputPath))).toBe(false);
    expect(() => service.cancel(jobId)).toThrow('Job not found or already completed');
  });

  it('waits for cancellation and removes every active output during shutdown', async () => {
    await service.transcode(options);
    await service.transcode({ ...options, outputFilename: 'second' });
    for (const process of processes.instances) fs.writeFileSync(process.outputPath, 'partial');
    await service.dispose();
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(pushPublisher.emit.mock.calls.filter(([channel]) => channel === 'transcode:cancelled')).toHaveLength(2);
    await expect(service.transcode(options)).rejects.toThrow('TranscodeService not initialized');
  });

  it('does not start an encoder when shutdown overtakes input preparation', async () => {
    let finishProbe!: (duration: number) => void;
    vi.mocked(probeDuration).mockImplementationOnce(() => new Promise((resolve) => { finishProbe = resolve; }));
    const pending = service.transcode(options);
    const rejected = expect(pending).rejects.toThrow('TranscodeService not initialized');
    await vi.waitFor(() => expect(finishProbe).toBeTypeOf('function'));
    const disposing = service.dispose();
    finishProbe(250000);
    await rejected;
    await disposing;
    expect(processes.instances).toHaveLength(0);
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it('drains accepted preparation and encoding before shutdown without deleting the output', async () => {
    let finishProbe!: (duration: number) => void;
    vi.mocked(probeDuration).mockImplementationOnce(() => new Promise((resolve) => { finishProbe = resolve; }));
    const accepted = service.transcode(options);
    await vi.waitFor(() => expect(finishProbe).toBeTypeOf('function'));
    const settled = vi.fn();
    const draining = service.drain().then(settled);
    await expect(service.transcode({ ...options, outputFilename: 'late' })).rejects.toThrow('not initialized');
    finishProbe(250000);
    await accepted;
    const process = processes.instances[0]!;
    fs.writeFileSync(process.outputPath, 'encoded');
    expect(settled).not.toHaveBeenCalled();
    process.finish('completed');
    await draining;
    await service.dispose();
    expect(fs.readFileSync(process.outputPath, 'utf8')).toBe('encoded');
    expect(pushPublisher.emit).not.toHaveBeenCalledWith('transcode:cancelled', expect.anything());
  });

  it('preserves interrupted recording recovery arguments and tolerates missing duration', async () => {
    vi.mocked(probeDuration).mockRejectedValueOnce(new Error('probe unavailable'));
    const inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err'];
    await service.transcode({ ...options, inputArgs });
    expect(processes.instances[0]!.inputArgs).toEqual(inputArgs);
  });

  it('rejects invalid requests before allocating temporary files', async () => {
    await expect(service.transcode({ ...options, outputFilename: '' })).rejects.toThrow('Output filename is required');
    await expect(service.transcode({ ...options, format: 'invalid' as never })).rejects.toThrow('Unsupported format');
    expect(fs.readdirSync(directory)).toEqual([]);
  });
});
