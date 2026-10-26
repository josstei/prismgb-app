import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureSaveService } from '@renderer/infrastructure/services/capture/capture-save.service';
import { EventChannels } from '@platform/events';
import { createEventBus } from '../../../../../factories/event-bus.factory.js';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
import { createSettingsServiceMock } from '../../../../../factories/settings.factory.js';

type Transcode = ConstructorParameters<typeof CaptureSaveService>[0]['transcodeService']['transcode'];

describe('capture save routes and outcomes', () => {
  let service: CaptureSaveService;
  let settings: ReturnType<typeof createSettingsServiceMock>;
  let eventBus: ReturnType<typeof createEventBus>;
  let transcode: ReturnType<typeof vi.fn<Transcode>>;
  let downloadFile: ReturnType<typeof vi.fn<(blob: Blob, filename: string) => Promise<void>>>;

  beforeEach(() => {
    settings = createSettingsServiceMock({ values: { recordingFormat: 'webm' } });
    eventBus = createEventBus();
    transcode = vi.fn<Transcode>().mockResolvedValue({ status: 'ok', value: { jobId: 'job-123' } });
    downloadFile = vi.fn<(blob: Blob, filename: string) => Promise<void>>(async () => {});
    service = new CaptureSaveService({
      downloadFile, eventBus, settingsService: settings,
      transcodeService: { transcode }, loggerFactory: createLoggerFactory()
    });
  });
  afterEach(() => service.dispose());

  it('downloads WebM recordings and PNG screenshots directly with their original names', async () => {
    const recording = new Blob(['recording'], { type: 'video/webm' });
    const screenshot = new Blob(['screenshot'], { type: 'image/png' });
    expect(await service.saveRecording(recording, 'recording.webm')).toEqual({ success: true, transcoded: false });
    expect(await service.saveScreenshot(screenshot, 'screenshot.png')).toEqual({ success: true, transcoded: false });
    expect(downloadFile).toHaveBeenCalledWith(recording, 'recording.webm');
    expect(downloadFile).toHaveBeenCalledWith(screenshot, 'screenshot.png');
    expect(transcode).not.toHaveBeenCalled();
  });

  it.each(['mp4', 'mov'] as const)('converts %s with the final filename extension removed', async (format) => {
    settings.setSetting('recordingFormat', format);
    const recording = new Blob(['recording'], { type: 'video/webm' });
    expect(await service.saveRecording(recording, 'my.recording-2024.webm')).toEqual({ success: true, transcoded: true });
    expect(transcode).toHaveBeenCalledExactlyOnceWith(recording, format, 'my.recording-2024', {});
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('preserves recovery arguments for an interrupted recording', async () => {
    settings.setSetting('recordingFormat', 'mp4');
    const recording = new Blob(['interrupted']);
    await service.saveRecording(recording, 'recording.webm', { interrupted: true });
    expect(transcode).toHaveBeenCalledWith(recording, 'mp4', 'recording', {
      inputArgs: ['-fflags', '+genpts', '-err_detect', 'ignore_err']
    });
  });

  it.each([
    ['result', 'FFmpeg not found'],
    ['rejection', 'Network error']
  ] as const)('reports a conversion failure returned as a %s', async (failure, message) => {
    settings.setSetting('recordingFormat', 'mp4');
    if (failure === 'result') transcode.mockResolvedValue({ status: 'error', error: message });
    else transcode.mockRejectedValue(new Error(message));
    expect(await service.saveRecording(new Blob(['recording']), 'recording.webm'))
      .toEqual({ success: false, error: message });
    expect(eventBus.publish).toHaveBeenCalledWith(EventChannels.UI.STATUS_MESSAGE, {
      message: `Conversion failed: ${message}`, type: 'error'
    });
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('returns a failed download without starting a conversion', async () => {
    downloadFile.mockRejectedValue(new Error('Blob too large'));
    expect(await service.saveRecording(new Blob(['recording']), 'recording.webm'))
      .toEqual({ success: false, error: 'Blob too large' });
    expect(transcode).not.toHaveBeenCalled();
  });
});
