import { app } from 'electron';
import updater from 'electron-updater';
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import {
  IPC_CHANNELS,
  UpdateState,
  type UpdateCheckPayload,
  type UpdateStateValue,
  type UpdateStatusPayload
} from '@platform/ipc';
import pkg from '../../../../package.json' assert { type: 'json' };
import { TOKENS } from '@main/application/di/tokens';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';

const { autoUpdater } = updater;

const INITIAL_CHECK_KEY = Symbol('initialUpdateCheck');
const PERIODIC_CHECK_KEY = Symbol('periodicUpdateCheck');
const INITIAL_CHECK_DELAY_MS = 10000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

type AutoUpdaterEventName = Parameters<typeof autoUpdater.on>[0];
type AutoUpdaterListener = Parameters<typeof autoUpdater.on>[1];

/** A release published without this platform's manifest reads as "no update", not as an error. */
export function isPlatformManifestMissing(message: string | null | undefined): boolean {
  return /Cannot find latest(?:-[^/\s]+)?\.yml/.test(message || '');
}

@injectable()
export class AutoUpdateService extends BaseService {
  state: UpdateStateValue = UpdateState.IDLE;
  updateInfo: UpdateInfo | null = null;
  downloadProgress: ProgressInfo | null = null;
  error: string | null = null;

  private readonly version = pkg.version;
  private readonly isDevelopment = process.env.NODE_ENV === 'development';
  private initialized = false;

  constructor(
    @inject(TOKENS.ipcPushBridge) private readonly ipcPushBridge: IpcPushBridge,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'AutoUpdateService');
  }

  initialize(): void {
    if (this.initialized) {
      this.logger.warn('UpdateService already initialized');
      return;
    }

    this.logger.info('Initializing update service');

    autoUpdater.logger = {
      info: (msg: string) => this.logger.info(msg),
      warn: (msg: string) => this.logger.warn(msg),
      error: (msg: string | Error) => {
        if (isPlatformManifestMissing(String(msg))) {
          return;
        }
        this.logger.error(msg);
      },
      debug: (msg: string) => this.logger.debug(msg)
    };

    // The user decides when to download.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowPrerelease = this.version.includes('beta');

    this.listenToAutoUpdater();

    this.logger.info('Update service initialized', {
      allowPrerelease: autoUpdater.allowPrerelease,
      version: this.version
    });
    this.initialized = true;
    this.startAutoCheck();
  }

  async checkForUpdates(): Promise<UpdateCheckPayload> {
    if (this.state === UpdateState.DOWNLOADED || this.state === UpdateState.DOWNLOADING) {
      this.logger.info('Skipping update check - update already in progress or downloaded');
      return { updateAvailable: true, updateInfo: this.updateInfo || undefined, skipped: true };
    }

    if (this.isDevelopment) {
      this.logger.info('Skipping update check in development mode');
      this.state = UpdateState.NOT_AVAILABLE;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, { version: this.version, reason: 'development' });
      return { updateAvailable: false, reason: 'development' };
    }

    try {
      this.logger.info('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: result?.updateInfo?.version !== this.version,
        updateInfo: result?.updateInfo
      };
    } catch (error) {
      if (isPlatformManifestMissing((error as Error)?.message)) {
        return { updateAvailable: false, reason: 'platform-not-supported' };
      }
      this.logger.error('Failed to check for updates', error as Error);
      throw error;
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.state === UpdateState.DOWNLOADED) {
      this.logger.info('Update already downloaded');
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.DOWNLOADED, this.updateInfo);
      return;
    }

    if (this.state !== UpdateState.AVAILABLE) {
      throw new Error('No update available to download');
    }

    try {
      this.logger.info('Downloading update...');
      this.state = UpdateState.DOWNLOADING;
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.logger.error('Failed to download update', error as Error);
      this.state = UpdateState.ERROR;
      this.error = (error as Error)?.message || null;
      throw error;
    }
  }

  installUpdate(): void {
    if (this.state !== UpdateState.DOWNLOADED) {
      throw new Error('No update downloaded to install');
    }

    this.logger.info('Installing update and restarting...');
    app.isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  }

  getStatus(): UpdateStatusPayload {
    return {
      state: this.state,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      error: this.error
    };
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    this.initialized = false;
    this.logger.info('UpdateService disposed');
  }

  private listenToAutoUpdater(): void {
    this.onAutoUpdater('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this.state = UpdateState.CHECKING;
    });

    this.onAutoUpdater('update-available', (info: UpdateInfo) => {
      this.logger.info('Update available', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.AVAILABLE;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.AVAILABLE, info);
    });

    this.onAutoUpdater('update-not-available', (info: UpdateInfo) => {
      this.logger.info('No updates available', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.NOT_AVAILABLE;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, info);
    });

    this.onAutoUpdater('download-progress', (progress: ProgressInfo) => {
      this.logger.debug('Download progress', {
        percent: progress.percent?.toFixed(1),
        transferred: progress.transferred,
        total: progress.total
      });
      this.downloadProgress = progress;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.PROGRESS, progress);
    });

    this.onAutoUpdater('update-downloaded', (info: UpdateInfo) => {
      this.logger.info('Update downloaded', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.DOWNLOADED;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.DOWNLOADED, info);
    });

    this.onAutoUpdater('error', (error: Error) => {
      if (isPlatformManifestMissing(error?.message)) {
        this.logger.info('No updates available for this platform');
        this.state = UpdateState.NOT_AVAILABLE;
        this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, {
          version: this.version,
          reason: 'platform-not-supported'
        });
        return;
      }

      this.logger.error('Update error', error);
      this.error = error.message || null;
      this.state = UpdateState.ERROR;
      this.ipcPushBridge.emit(IPC_CHANNELS.UPDATE.ERROR, { message: error.message });
    });
  }

  private onAutoUpdater(eventName: AutoUpdaterEventName, listener: AutoUpdaterListener): void {
    autoUpdater.on(eventName, listener);
    this.disposables.add(() => {
      autoUpdater.removeListener(eventName, listener);
    });
  }

  private startAutoCheck(): void {
    this.disposables.schedule(INITIAL_CHECK_KEY, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', (error as Error).message);
      });
    }, INITIAL_CHECK_DELAY_MS);

    this.disposables.scheduleInterval(PERIODIC_CHECK_KEY, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', (error as Error).message);
      });
    }, CHECK_INTERVAL_MS);

    this.logger.info(`Auto-update check started (interval: ${CHECK_INTERVAL_MS / 1000 / 60} minutes)`);
  }
}
