import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import { BaseService } from '@platform/core';
import type { LoggerFactoryLike as LoggerFactory } from '@platform/core';
import { IPC_CHANNELS } from '@platform/ipc';
import type { IpcPushPublisher, IpcPushPayloadMap, IpcPushArguments, UpdateCheckPayload, UpdateStatusPayload } from '@platform/ipc';
import { UpdateState, type UpdateStateValue } from '@platform/config';

const INITIAL_UPDATE_CHECK_LIFECYCLE = Symbol('initialUpdateCheck');
const PERIODIC_UPDATE_CHECK_LIFECYCLE = Symbol('periodicUpdateCheck');
interface Config {
  isDevelopment?: boolean;
  version?: string;
}

interface UpdateServiceDependencies {
  pushPublisher: IpcPushPublisher;
  prepareInstall: () => void;
  loggerFactory: LoggerFactory;
  config: Config;
}

type AutoUpdaterEventName = Parameters<typeof autoUpdater.on>[0];
type AutoUpdaterListener = Parameters<typeof autoUpdater.on>[1];

class UpdateService extends BaseService {
  private readonly pushPublisher: IpcPushPublisher;
  private readonly prepareInstall: () => void;
  private readonly config: Config;

  state: UpdateStateValue;
  updateInfo: UpdateInfo | null;
  downloadProgress: ProgressInfo | null;
  error: Error | null;

  private _autoCheckRunning: boolean;

  constructor(dependencies: UpdateServiceDependencies) {
    super(dependencies, 'UpdateService');

    this.pushPublisher = dependencies.pushPublisher;
    this.prepareInstall = dependencies.prepareInstall;
    this.config = dependencies.config;

    this.state = UpdateState.IDLE;
    this.updateInfo = null;
    this.downloadProgress = null;
    this.error = null;

    this._autoCheckRunning = false;
  }

  /**
   * Initialize the update service
   * Sets up autoUpdater configuration and event listeners
   */
  protected override onInitialize(): void {
    this.logger.info('Initializing update service');

    // Configure autoUpdater
    autoUpdater.logger = {
      info: (msg: string) => this.logger.info(msg),
      warn: (msg: string) => this.logger.warn(msg),
      error: (msg: string | Error) => {
        if (this._isPlatformNotFoundMessage(String(msg))) {
          return;
        }
        this.logger.error(msg);
      },
      debug: (msg: string) => this.logger.debug(msg)
    };

    // Don't auto-download updates - let user decide
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Allow pre-release updates if running a beta version
    const version = this.config.version || '';
    autoUpdater.allowPrerelease = version.includes('beta');

    // Set up event listeners
    this._setupEventListeners();

    this.logger.info('Update service initialized', {
      allowPrerelease: autoUpdater.allowPrerelease,
      version
    });
  }

  /**
   * Set up autoUpdater event listeners
   * @private
   */
  private _setupEventListeners(): void {
    this._listenToAutoUpdater('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this.state = UpdateState.CHECKING;
    });

    this._listenToAutoUpdater('update-available', (info: UpdateInfo) => {
      this.logger.info('Update available', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.AVAILABLE;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.AVAILABLE, info);
    });

    this._listenToAutoUpdater('update-not-available', (info: UpdateInfo) => {
      this.logger.info('No updates available', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.NOT_AVAILABLE;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, info);
    });

    this._listenToAutoUpdater('download-progress', (progress: ProgressInfo) => {
      this.logger.debug('Download progress', {
        percent: progress.percent?.toFixed(1),
        transferred: progress.transferred,
        total: progress.total
      });
      this.downloadProgress = progress;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.PROGRESS, progress);
    });

    this._listenToAutoUpdater('update-downloaded', (info: UpdateInfo) => {
      this.logger.info('Update downloaded', { version: info.version });
      this.updateInfo = info;
      this.state = UpdateState.DOWNLOADED;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, info);
    });

    this._listenToAutoUpdater('error', (error: Error) => {
      if (this._isPlatformNotFoundMessage(error.message)) {
        this.logger.info('No updates available for this platform');
        this.state = UpdateState.NOT_AVAILABLE;
        this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, {
          version: this.config.version,
          reason: 'platform-not-supported'
        });
        return;
      }

      this.logger.error('Update error', error);
      this.error = error;
      this.state = UpdateState.ERROR;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.ERROR, { message: error.message });
    });
  }

  private _listenToAutoUpdater(eventName: AutoUpdaterEventName, listener: AutoUpdaterListener): void {
    autoUpdater.on(eventName, listener);
    this.disposables.add(() => {
      autoUpdater.removeListener(eventName, listener);
    });
  }

  /**
   * Check if a message indicates platform manifest not found
   * @param message - The message to check
   * @returns True if this is a platform-not-found message
   * @private
   */
  private _isPlatformNotFoundMessage(message: string | null | undefined): boolean {
    return /Cannot find latest(?:-[^/\s]+)?\.yml/.test(message || '');
  }

  /**
   * Notify renderer process of update events
   * @param channel - IPC channel name
   * @param data - Data to send
   * @private
   */
  private _notifyRenderer<K extends keyof IpcPushPayloadMap>(...args: IpcPushArguments<K>): void {
    try {
      this.pushPublisher.emit<K>(...args);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel: args[0], error: (error as Error).message });
    }
  }

  /**
   * Check for updates
   * @returns Update check result
   */
  async checkForUpdates(): Promise<UpdateCheckPayload> {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    if (this.state === UpdateState.DOWNLOADED || this.state === UpdateState.DOWNLOADING) {
      this.logger.info('Skipping update check - update already in progress or downloaded');
      return { updateAvailable: true, updateInfo: this.updateInfo || undefined, skipped: true };
    }

    // Skip in development mode
    if (this.config.isDevelopment) {
      this.logger.info('Skipping update check in development mode');
      this.state = UpdateState.NOT_AVAILABLE;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, { version: this.config.version, reason: 'development' });
      return { updateAvailable: false, reason: 'development' };
    }

    try {
      this.logger.info('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: result?.updateInfo?.version !== this.config.version,
        updateInfo: result?.updateInfo
      };
    } catch (error) {
      if (this._isPlatformNotFoundMessage((error as Error)?.message)) {
        return { updateAvailable: false, reason: 'platform-not-supported' };
      }
      this.logger.error('Failed to check for updates', error as Error);
      throw error;
    }
  }

  /**
   * Download available update
   * @returns Promise that resolves when download completes
   */
  async downloadUpdate(): Promise<void> {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    if (this.state === UpdateState.DOWNLOADED) {
      this.logger.info('Update already downloaded');
      if (this.updateInfo) this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, this.updateInfo);
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
      this.error = error as Error;
      throw error;
    }
  }

  /**
   * Install downloaded update and restart app
   */
  installUpdate(): void {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    if (this.state !== UpdateState.DOWNLOADED) {
      throw new Error('No update downloaded to install');
    }

    this.logger.info('Installing update and restarting...');
    this.prepareInstall();
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Start automatic update checking at specified interval
   * @param intervalMs - Check interval in milliseconds (default: 1 hour)
   */
  startAutoCheck(intervalMs = 60 * 60 * 1000): void {
    if (this._autoCheckRunning) {
      this.logger.warn('Auto-check already running');
      return;
    }

    this._autoCheckRunning = true;

    this.schedule(INITIAL_UPDATE_CHECK_LIFECYCLE, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', (error as Error).message);
      });
    }, 10000);

    this.scheduleInterval(PERIODIC_UPDATE_CHECK_LIFECYCLE, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', (error as Error).message);
      });
    }, intervalMs);

    this.logger.info(`Auto-update check started (interval: ${intervalMs / 1000 / 60} minutes)`);
  }

  /**
   * Stop automatic update checking
   */
  private stopAutoCheck(): void {
    const wasRunning = this._autoCheckRunning;
    this.cancelManaged(INITIAL_UPDATE_CHECK_LIFECYCLE);
    this.cancelManaged(PERIODIC_UPDATE_CHECK_LIFECYCLE);
    this._autoCheckRunning = false;
    if (wasRunning) {
      this.logger.info('Auto-update check stopped');
    }
  }

  /**
   * Get current update status
   * @returns Current status object
   */
  getStatus(): UpdateStatusPayload {
    return {
      state: this.state,
      updateInfo: this.updateInfo,
      downloadProgress: this.downloadProgress,
      error: this.error?.message || null
    };
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.stopAutoCheck();
    await super.dispose();
    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
