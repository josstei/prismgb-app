import { injectable, inject } from 'inversify';
import { BaseService, getErrorMessage } from '@platform/core';
import { EventChannels } from '@renderer/lib/events/event-channels';
import type { EventBus } from '@renderer/lib/events/event-bus';
import { downloadFile } from '@renderer/lib/file-download.utils';
import type { LoggerFactory } from '@platform/core';
import type { TranscodeFormat } from '@platform/ipc';
import { TOKENS } from '@renderer/application/di/tokens';
import type { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';

interface RecordingSaveOptions {
  interrupted?: boolean;
}

interface SaveResult {
  success: boolean;
  transcoded?: boolean;
  error?: string;
}

@injectable()
class CaptureSaveService extends BaseService {
  constructor(
    @inject(TOKENS.eventBus) private readonly eventBus: EventBus,
    @inject(TOKENS.settingsService) private readonly settingsService: Pick<SettingsService, 'getStringSetting'>,
    @inject(TOKENS.transcodeService) private readonly transcodeService: Pick<TranscodeService, 'isAvailable' | 'transcode'>,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'CaptureSaveService');
  }

  async saveRecording(blob: Blob, filename: string, options: RecordingSaveOptions = {}): Promise<SaveResult> {
    const format = this.settingsService.getStringSetting('recordingFormat');
    const interrupted = Boolean(options.interrupted);

    this.logger.info(`Saving recording with format preference: ${format}`);

    if (format === 'webm' || !this.transcodeService.isAvailable()) {
      return this._directSave(blob, filename);
    }

    const baseName = filename.replace(/\.[^.]+$/, '');
    // The recordingFormat setting only admits TRANSCODE_FORMATS values.
    return this._transcodeAndSave(blob, format as TranscodeFormat, baseName, { interrupted });
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
    format: TranscodeFormat,
    outputBaseName: string,
    options: RecordingSaveOptions = {}
  ): Promise<SaveResult> {
    try {
      this.logger.info(`Starting transcode to ${format}`);
      const result = await this.transcodeService.transcode(blob, format, outputBaseName, {
        interrupted: Boolean(options.interrupted)
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

  override dispose(): Promise<void> {
    this.logger.info('CaptureSaveService disposed');
    return super.dispose();
  }
}

export { CaptureSaveService };
