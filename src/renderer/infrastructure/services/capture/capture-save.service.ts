import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import { downloadFile } from '@shared/lib/file-download.utils';
import type { EventBusLike, LoggerFactoryLike } from '@shared/interfaces/infrastructure.types.js';

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

type CaptureTranscodeResult = {
  success: boolean;
  error?: string;
};

type CaptureTranscodeServiceLike = {
  isAvailable(): boolean;
  transcode(
    blob: Blob,
    format: string,
    outputBaseName: string,
    options: { inputArgs?: string[]; interrupted: boolean }
  ): Promise<CaptureTranscodeResult>;
};

type CaptureSaveServiceDependencies = {
  eventBus: EventBusLike;
  settingsService: CaptureSettingsServiceLike;
  transcodeService: CaptureTranscodeServiceLike;
  loggerFactory: LoggerFactoryLike;
};

class CaptureSaveService extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly settingsService: CaptureSettingsServiceLike;
  private readonly transcodeService: CaptureTranscodeServiceLike;

  constructor(dependencies: CaptureSaveServiceDependencies) {
    super(
      dependencies,
      ['eventBus', 'settingsService', 'transcodeService', 'loggerFactory'],
      'CaptureSaveService'
    );

    this.eventBus = dependencies.eventBus;
    this.settingsService = dependencies.settingsService;
    this.transcodeService = dependencies.transcodeService;
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
      const message = error instanceof Error ? error.message : String(error);
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

      if (!result.success) {
        this.logger.error('Transcode failed', result.error);
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
          message: `Conversion failed: ${result.error}`,
          type: 'error'
        });
        return { success: false, error: result.error };
      }

      return { success: true, transcoded: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Transcode and save failed', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: `Conversion failed: ${message}`,
        type: 'error'
      });
      return { success: false, error: message };
    }
  }

  override dispose(): void | Promise<void> {
    return super.dispose();
  }
}

export { CaptureSaveService };
