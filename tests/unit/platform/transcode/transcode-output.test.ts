import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TranscodeService } from '@platform/transcode/service';
import { getFfmpegPath, getFfprobePath } from '../../../../src/platform/transcode/ffmpeg-path.utils.js';
import { createLoggerFactory } from '../../../factories/index.js';

const binaryEnvironment = { isPackaged: false, resourcesPath: '' };
const ffmpeg = getFfmpegPath(binaryEnvironment);
const ffprobe = getFfprobePath(binaryEnvironment);

/** Exercise the actual process, progress parser and output codecs using a tiny generated clip. */
describe('main transcode media outputs', () => {
  let inputBuffer: Buffer;
  let directory: string;
  let service: TranscodeService;
  const publish = vi.fn();

  beforeAll(() => {
    inputBuffer = execFileSync(ffmpeg, [
      '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=160x144:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
      '-t', '0.4', '-c:v', 'libvpx-vp9', '-threads', '1', '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus', '-f', 'webm', 'pipe:1'
    ], { timeout: 10000, maxBuffer: 1024 * 1024 });
  });
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-media-output-'));
    service = new TranscodeService({
      pushPublisher: { emit: publish },
      loggerFactory: createLoggerFactory(),
      environment: { ...binaryEnvironment, downloadsDir: directory, tempDir: directory }
    });
    await service.initialize();
  });
  afterEach(async () => { await service.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });

  it.each([
    ['mp4', 'h264', 'aac'],
    ['mov', 'prores', 'pcm_s16le']
  ] as const)('writes playable %s with the requested audio and video codecs', async (format, videoCodec, audioCodec) => {
    fs.writeFileSync(path.join(directory, `clip.${format}`), 'previous successful recording');
    const accepted = service.transcode({ inputBuffer, format, outputFilename: 'clip', inputArgs: ['-fflags', '+genpts', '-err_detect', 'ignore_err'] });
    await service.drain();
    const { jobId } = await accepted;
    await service.dispose();
    expect(publish).not.toHaveBeenCalledWith('transcode:error', expect.anything());
    expect(publish).not.toHaveBeenCalledWith('transcode:cancelled', expect.anything());
    expect(publish).toHaveBeenCalledWith('transcode:completed', { jobId, filePath: path.join(directory, `clip.${format}`) });
    const output = JSON.parse(execFileSync(ffprobe, [
      '-v', 'error', '-show_entries', 'stream=codec_name,codec_type,width,height:format=duration',
      '-of', 'json', path.join(directory, `clip.${format}`)
    ], { encoding: 'utf8', timeout: 10000 })) as {
      streams: Array<{ codec_type: string; codec_name: string; width?: number; height?: number }>;
      format: { duration: string };
    };
    expect(output.streams).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_type: 'video', codec_name: videoCodec, width: 160, height: 144 }),
      expect.objectContaining({ codec_type: 'audio', codec_name: audioCodec })
    ]));
    expect(Number(output.format.duration)).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(directory, 'prismgb-transcode'))).toBe(false);
  });

  it('reports invalid input and removes partial output and temporary files', async () => {
    const { jobId } = await service.transcode({ inputBuffer: Buffer.from('not a media file'), format: 'mp4', outputFilename: 'broken' });
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith('transcode:error', expect.objectContaining({ jobId })), { timeout: 10000 });
    expect(fs.existsSync(path.join(directory, 'broken.mp4'))).toBe(false);
    expect(fs.existsSync(path.join(directory, 'prismgb-transcode'))).toBe(false);
  });

  it('does not delete an existing successful file when replacement input cannot be decoded', async () => {
    const outputPath = path.join(directory, 'keep.mp4');
    fs.writeFileSync(outputPath, 'previous successful recording');
    const { jobId } = await service.transcode({ inputBuffer: Buffer.from('not a media file'), format: 'mp4', outputFilename: 'keep' });
    await vi.waitFor(() => expect(publish).toHaveBeenCalledWith('transcode:error', expect.objectContaining({ jobId })), { timeout: 10000 });
    expect(fs.readFileSync(outputPath, 'utf8')).toBe('previous successful recording');
    expect(fs.readdirSync(directory).filter((entry) => entry.endsWith('.mp4'))).toEqual(['keep.mp4']);
  });
});
