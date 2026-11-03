
import { BaseService, getErrorMessage } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type { CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc.js';
import type { TranscodeStartPayload, TranscodeFormat } from '@platform/ipc';
import type { SettingsAccess } from '@renderer/lib/settings.definitions';

interface RecordingSaveOptions {
  interrupted?: boolean;
}

interface SaveResult {
  success: boolean;
  transcoded?: boolean;
  error?: string;
}

type CaptureSettingsServiceLike = Pick<SettingsAccess, 'getSetting'>;

type CaptureTranscodeServiceLike = {
  transcode(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName: string,
    options: { inputArgs?: string[] }
  ): Promise<CallIpcResult<TranscodeStartPayload>>;
};

type CaptureSaveServiceDependencies = {
  downloadFile(blob: Blob, filename: string): Promise<void>;
  eventBus: EventBusLike;
  settingsService: CaptureSettingsServiceLike;
  transcodeService: CaptureTranscodeServiceLike;
  loggerFactory: LoggerFactoryLike;
};

class CaptureSaveService extends BaseService {
  private readonly downloadFile: CaptureSaveServiceDependencies['downloadFile'];
  private readonly eventBus: EventBusLike;
  private readonly settingsService: CaptureSettingsServiceLike;
  private readonly transcodeService: CaptureTranscodeServiceLike;

  constructor({ downloadFile, eventBus, settingsService, transcodeService, loggerFactory }: CaptureSaveServiceDependencies) {
    super({ loggerFactory, eventBus }, 'CaptureSaveService');
    this.downloadFile = downloadFile;
    this.eventBus = eventBus;
    this.settingsService = settingsService;
    this.transcodeService = transcodeService;
  }

  async saveRecording(blob: Blob, filename: string, options: RecordingSaveOptions = {}): Promise<SaveResult> {
    const format = this.settingsService.getSetting('recordingFormat');
    const interrupted = Boolean(options.interrupted);

    this.logger.info(`Saving recording with format preference: ${format}`);

    if (format === 'webm') {
      return this._directSave(blob, filename);
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    return this._transcodeAndSave(blob, format, baseName, { interrupted });
  }

  async saveScreenshot(blob: Blob, filename: string): Promise<SaveResult> {
    return this._directSave(blob, filename);
  }

  async _directSave(blob: Blob, filename: string): Promise<SaveResult> {
    try {
      await this.downloadFile(blob, filename);

      this.logger.info(`Direct save completed: ${filename}`);
      return { success: true, transcoded: false };
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error('Direct save failed', error);
      return { success: false, error: message };
    }
  }

  async _transcodeAndSave(
    blob: Blob,
    format: TranscodeFormat,
    outputBaseName: string,
    options: RecordingSaveOptions = {}
  ): Promise<SaveResult> {
    try {
      this.logger.info(`Starting transcode to ${format}`);
      const interrupted = Boolean(options.interrupted);
      const inputArgs = interrupted ? ['-fflags', '+genpts', '-err_detect', 'ignore_err'] : undefined;

      const result = await this.transcodeService.transcode(blob, format, outputBaseName, {
        ...(inputArgs ? { inputArgs } : {})
      });

      if (result.status === 'error') {
        this.logger.error('Transcode failed', result.error);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
          message: `Conversion failed: ${result.error}`,
          type: 'error'
        });
        return { success: false, error: result.error };
      }

      return { success: true, transcoded: true };
    } catch (error) {
      const message = getErrorMessage(error);
      this.logger.error('Transcode and save failed', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: `Conversion failed: ${message}`,
        type: 'error'
      });
      return { success: false, error: message };
    }
  }

  override dispose(): void | Promise<void> {
    this.logger.info('CaptureSaveService disposed');
    return super.dispose();
  }
}

export { CaptureSaveService };
