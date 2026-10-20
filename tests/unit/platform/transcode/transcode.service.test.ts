import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscodeService } from '@platform/transcode/service';
import { createLoggerFactory } from '../../../factories/index.js';

const { validateFfmpegBinaries, cleanupAllSessions } = vi.hoisted(() => ({
  validateFfmpegBinaries: vi.fn(),
  cleanupAllSessions: vi.fn()
}));

vi.mock('../../../../src/platform/transcode/ffmpeg-path.utils', () => ({ validateFfmpegBinaries }));
vi.mock('../../../../src/platform/transcode/transcode-temp.utils', () => ({
  createTempSession: vi.fn(),
  writeTempFile: vi.fn(),
  cleanupSession: vi.fn(),
  cleanupAllSessions
}));

const NOT_INITIALIZED = { success: false, error: 'TranscodeService not initialized' };

describe('TranscodeService initialize guard', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;
  let service: TranscodeService;

  const transcodeRequest = () => service.transcode({
    inputBuffer: Buffer.from([]),
    format: 'unsupported',
    outputFilename: 'recording'
  });
  const logger = () => loggerFactory._getLogger('TranscodeService');

  beforeEach(() => {
    validateFfmpegBinaries.mockReturnValue({ ffmpegPath: '/bin/ffmpeg', ffprobePath: null });
    loggerFactory = createLoggerFactory();
    service = new TranscodeService({ windowService: { send: vi.fn() }, loggerFactory });
  });

  it('refuses transcode() before initialize()', async () => {
    await expect(transcodeRequest()).resolves.toEqual(NOT_INITIALIZED);
  });

  it('passes the guard once initialized', async () => {
    service.initialize();

    await expect(transcodeRequest()).resolves.toEqual({ success: false, error: 'Unsupported format: unsupported' });
  });

  it('warns and skips a second initialize()', () => {
    service.initialize();
    service.initialize();

    expect(logger().warn).toHaveBeenCalledWith('TranscodeService already initialized');
    expect(validateFfmpegBinaries).toHaveBeenCalledTimes(1);
  });

  it('still initializes when the ffmpeg binaries are missing', async () => {
    validateFfmpegBinaries.mockImplementation(() => {
      throw new Error('ffmpeg missing');
    });

    service.initialize();

    expect(logger().error).toHaveBeenCalledWith('FFmpeg binary not found', { error: 'ffmpeg missing' });
    await expect(transcodeRequest()).resolves.toEqual({ success: false, error: 'Unsupported format: unsupported' });
  });

  it('refuses transcode() again after dispose()', async () => {
    service.initialize();
    await service.dispose();

    expect(cleanupAllSessions).toHaveBeenCalledTimes(1);
    await expect(transcodeRequest()).resolves.toEqual(NOT_INITIALIZED);
  });
});
