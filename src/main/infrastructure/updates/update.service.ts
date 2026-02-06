// @ts-nocheck
/**
 * Update Service (Main)
 * Handles automatic updates using electron-updater
 * Manages update checking, downloading, and installation
 */

import { app } from 'electron';
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater';
import { BaseService } from '@shared/base/service.base.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.config.js';

/**
 * Update states
 */
export const UpdateState = {
  IDLE: 'idle',
  CHECKING: 'checking',
  AVAILABLE: 'available',
  NOT_AVAILABLE: 'not-available',
  DOWNLOADING: 'downloading',
  DOWNLOADED: 'downloaded',
  ERROR: 'error'
} as const;

export type UpdateStateType = (typeof UpdateState)[keyof typeof UpdateState];

interface WindowService {
  send(channel: string, data: unknown): void;
}

interface EventBus {
  publish(event: string, data: unknown): void;
}

interface LoggerFactory {
  create(name: string): Logger;
}

interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string | Error, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

interface Config {
  isDevelopment?: boolean;
  version?: string;
}

interface UpdateServiceDependencies {
  windowService: WindowService;
  eventBus: EventBus;
  loggerFactory: LoggerFactory;
  config: Config;
}

interface UpdateCheckResult {
  updateAvailable: boolean;
  updateInfo?: UpdateInfo;
  skipped?: boolean;
  reason?: string;
}

interface UpdateStatus {
  state: UpdateStateType;
  updateInfo: UpdateInfo | null;
  downloadProgress: ProgressInfo | null;
  error: string | null;
}

class UpdateService extends BaseService {
  state: UpdateStateType;
  updateInfo: UpdateInfo | null;
  downloadProgress: ProgressInfo | null;
  error: Error | null;

  private _initialized: boolean;
  private _autoCheckIntervalId: NodeJS.Timeout | null;
  private _initialCheckTimeoutId: NodeJS.Timeout | null;

  constructor(dependencies: UpdateServiceDependencies) {
    super(dependencies, ['windowService', 'eventBus', 'loggerFactory', 'config'], 'UpdateService');

    this.state = UpdateState.IDLE;
    this.updateInfo = null;
    this.downloadProgress = null;
    this.error = null;

    this._initialized = false;
    this._autoCheckIntervalId = null;
    this._initialCheckTimeoutId = null;
  }

  /**
   * Initialize the update service
   * Sets up autoUpdater configuration and event listeners
   */
  initialize(): void {
    if (this._initialized) {
      this.logger.warn('UpdateService already initialized');
      return;
    }

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
    const version = (this.config as Config)?.version || '';
    autoUpdater.allowPrerelease = version.includes('beta');

    // Set up event listeners
    this._setupEventListeners();

    this._initialized = true;
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
    autoUpdater.on('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this._setState(UpdateState.CHECKING);
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.logger.info('Update available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.AVAILABLE, info);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.logger.info('No updates available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.NOT_AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, info);
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.logger.debug('Download progress', {
        percent: progress.percent?.toFixed(1),
        transferred: progress.transferred,
        total: progress.total
      });
      this.downloadProgress = progress;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.PROGRESS, progress);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.logger.info('Update downloaded', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.DOWNLOADED);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, info);
    });

    autoUpdater.on('error', (error: Error) => {
      if (this._isPlatformNotFoundError(error)) {
        this.logger.info('No updates available for this platform');
        this._setState(UpdateState.NOT_AVAILABLE);
        this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, {
          version: (this.config as Config)?.version,
          reason: 'platform-not-supported'
        });
        return;
      }

      this.logger.error('Update error', error);
      this.error = error;
      this._setState(UpdateState.ERROR);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.ERROR, { message: error.message });
    });
  }

  /**
   * Check if error is a platform manifest not found (404)
   * This happens when running on a platform that wasn't published in a release
   * @param error - The error from autoUpdater
   * @returns True if this is a platform-not-found error
   * @private
   */
  private _isPlatformNotFoundError(error: Error): boolean {
    const message = error?.message || '';
    return this._isPlatformNotFoundMessage(message);
  }

  /**
   * Check if a message indicates platform manifest not found
   * @param message - The message to check
   * @returns True if this is a platform-not-found message
   * @private
   */
  _isPlatformNotFoundMessage(message: string | null | undefined): boolean {
    return /Cannot find latest(?:-[^/\s]+)?\.yml/.test(message || '');
  }

  /**
   * Update internal state and publish event
   * @param newState - New state value
   * @private
   */
  _setState(newState: UpdateStateType): void {
    const oldState = this.state;
    this.state = newState;
    (this.eventBus as EventBus).publish(MainEventChannels.UPDATE.STATE_CHANGED, { oldState, newState });
  }

  /**
   * Notify renderer process of update events
   * @param channel - IPC channel name
   * @param data - Data to send
   * @private
   */
  _notifyRenderer(channel: string, data: unknown): void {
    try {
      (this.windowService as WindowService)?.send(channel, data);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel, error: (error as Error).message });
    }
  }

  /**
   * Check for updates
   * @param options - Check options
   * @param options.force - Force check even if already downloaded/downloading
   * @returns Update check result
   */
  async checkForUpdates({ force = false }: { force?: boolean } = {}): Promise<UpdateCheckResult> {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    // Skip if already downloaded or downloading (unless forced by user)
    if (!force && (this.state === UpdateState.DOWNLOADED || this.state === UpdateState.DOWNLOADING)) {
      this.logger.info('Skipping update check - update already in progress or downloaded');
      return { updateAvailable: true, updateInfo: this.updateInfo || undefined, skipped: true };
    }

    // Skip in development mode
    if ((this.config as Config)?.isDevelopment) {
      this.logger.info('Skipping update check in development mode');
      this._setState(UpdateState.NOT_AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, { version: (this.config as Config)?.version, reason: 'development' });
      return { updateAvailable: false, reason: 'development' };
    }

    try {
      this.logger.info('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: result?.updateInfo?.version !== (this.config as Config)?.version,
        updateInfo: result?.updateInfo
      };
    } catch (error) {
      if (this._isPlatformNotFoundError(error as Error)) {
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
      this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, this.updateInfo);
      return;
    }

    if (this.state !== UpdateState.AVAILABLE) {
      throw new Error('No update available to download');
    }

    try {
      this.logger.info('Downloading update...');
      this._setState(UpdateState.DOWNLOADING);
      await autoUpdater.downloadUpdate();
    } catch (error) {
      this.logger.error('Failed to download update', error as Error);
      this._setState(UpdateState.ERROR);
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
    (app as any).isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Start automatic update checking at specified interval
   * @param intervalMs - Check interval in milliseconds (default: 1 hour)
   */
  startAutoCheck(intervalMs = 60 * 60 * 1000): void {
    if (this._autoCheckIntervalId) {
      this.logger.warn('Auto-check already running');
      return;
    }

    // Perform initial check after a short delay (don't block startup)
    this._initialCheckTimeoutId = setTimeout(() => {
      this._initialCheckTimeoutId = null;
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', (error as Error).message);
      });
    }, 10000); // 10 seconds after startup

    // Set up periodic checks
    this._autoCheckIntervalId = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', (error as Error).message);
      });
    }, intervalMs);

    this.logger.info(`Auto-update check started (interval: ${intervalMs / 1000 / 60} minutes)`);
  }

  /**
   * Stop automatic update checking
   */
  stopAutoCheck(): void {
    if (this._initialCheckTimeoutId) {
      clearTimeout(this._initialCheckTimeoutId);
      this._initialCheckTimeoutId = null;
    }
    if (this._autoCheckIntervalId) {
      clearInterval(this._autoCheckIntervalId);
      this._autoCheckIntervalId = null;
      this.logger.info('Auto-update check stopped');
    }
  }

  /**
   * Get current update status
   * @returns Current status object
   */
  getStatus(): UpdateStatus {
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
  dispose(): void {
    this.stopAutoCheck();
    autoUpdater.removeAllListeners();
    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
