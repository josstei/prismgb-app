import { injectable, inject } from 'inversify';
import { BaseService, getErrorMessage } from '@platform/core';
import { EventChannels } from '@platform/events';
import { downloadFile } from '@renderer/lib/file-download.utils.js';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type { CallIpcResult } from '@renderer/infrastructure/ipc/call-ipc.js';
import type { TranscodeStartPayload } from '@platform/ipc';
import { TOKENS } from '@renderer/application/di/tokens.js';

interface RecordingSaveOptions {
  interrupted?: boolean;
}

interface SaveResult {
  success: boolean;
  transcoded?: boolean;
  error?: string;
}

type CaptureSettingsServiceLike = {
  getStringSetting(name: string): string;
};

type CaptureTranscodeServiceLike = {
  isAvailable(): boolean;
  transcode(
    blob: Blob,
    format: string,
    outputBaseName: string,
    options: { inputArgs?: string[]; interrupted: boolean }
  ): Promise<CallIpcResult<TranscodeStartPayload>>;
};

@injectable()
class CaptureSaveService extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBusLike,
    @inject(TOKENS.settingsService) private readonly settingsService: CaptureSettingsServiceLike,
    @inject(TOKENS.transcodeService) private readonly transcodeService: CaptureTranscodeServiceLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'CaptureSaveService');
  }

  async saveRecording(blob: Blob, filename: string, options: RecordingSaveOptions = {}): Promise<SaveResult> {
    const format = this.settingsService.getStringSetting('recordingFormat');
    const interrupted = Boolean(options.interrupted);

    this.logger.info(`Saving recording with format preference: ${format}`);

    if (format === 'webm' || !this.transcodeService.isAvailable()) {
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
      await downloadFile(blob, filename);

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
    format: string,
    outputBaseName: string,
    options: RecordingSaveOptions = {}
  ): Promise<SaveResult> {
    try {
      this.logger.info(`Starting transcode to ${format}`);
      const interrupted = Boolean(options.interrupted);
      const inputArgs = interrupted ? ['-fflags', '+genpts', '-err_detect', 'ignore_err'] : undefined;

      const result = await this.transcodeService.transcode(blob, format, outputBaseName, {
        inputArgs,
        interrupted
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
