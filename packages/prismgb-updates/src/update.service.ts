import { createRequire } from 'module';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import type { UpdateInfo, ProgressInfo } from 'electron-updater';
import { BaseService } from '@prismgb/core';
import type { ILoggerFactory as LoggerFactory } from '@prismgb/core';
import { IPC_CHANNELS } from '@prismgb/ipc';
import { UpdateState, type UpdateStateValue } from '@prismgb/config';

type UpdateStateType = UpdateStateValue;

const INITIAL_UPDATE_CHECK_LIFECYCLE = Symbol('initialUpdateCheck');
const PERIODIC_UPDATE_CHECK_LIFECYCLE = Symbol('periodicUpdateCheck');

let electronApp: any = null;
function getApp() {
  if (electronApp !== null) return electronApp;
  try {
    const require = createRequire(import.meta.url);
    electronApp = require('electron').app;
  } catch (err) {
    electronApp = null;
  }
  return electronApp;
}

interface WindowService {
  send(channel: string, data: unknown): void;
}

interface EventBus {
  publish(event: string, data: unknown): void;
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

type AutoUpdaterEventName = Parameters<typeof autoUpdater.on>[0];
type AutoUpdaterListener = Parameters<typeof autoUpdater.on>[1];

const MainEventChannels = {
  UPDATE: {
    STATE_CHANGED: 'update:state-changed' as const
  }
};

class UpdateService extends BaseService {
  private readonly windowService: WindowService;
  protected readonly eventBus: EventBus;
  private readonly config: Config;

  state: UpdateStateType;
  updateInfo: UpdateInfo | null;
  downloadProgress: ProgressInfo | null;
  error: Error | null;

  private _initialized: boolean;
  private _autoCheckRunning: boolean;

  constructor(dependencies: UpdateServiceDependencies) {
    super(dependencies, 'UpdateService');

    this.windowService = dependencies.windowService;
    this.eventBus = dependencies.eventBus;
    this.config = dependencies.config;

    this.state = UpdateState.IDLE;
    this.updateInfo = null;
    this.downloadProgress = null;
    this.error = null;

    this._initialized = false;
    this._autoCheckRunning = false;
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
    const version = this.config.version || '';
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
    this._listenToAutoUpdater('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this._setState(UpdateState.CHECKING);
    });

    this._listenToAutoUpdater('update-available', (info: UpdateInfo) => {
      this.logger.info('Update available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.AVAILABLE, info);
    });

    this._listenToAutoUpdater('update-not-available', (info: UpdateInfo) => {
      this.logger.info('No updates available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.NOT_AVAILABLE);
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
      this._setState(UpdateState.DOWNLOADED);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, info);
    });

    this._listenToAutoUpdater('error', (error: Error) => {
      if (this._isPlatformNotFoundError(error)) {
        this.logger.info('No updates available for this platform');
        this._setState(UpdateState.NOT_AVAILABLE);
        this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, {
          version: this.config.version,
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

  private _listenToAutoUpdater(eventName: AutoUpdaterEventName, listener: AutoUpdaterListener): void {
    autoUpdater.on(eventName, listener);
    this.disposables.add(() => {
      autoUpdater.removeListener(eventName, listener);
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
    this.eventBus.publish(MainEventChannels.UPDATE.STATE_CHANGED, { oldState, newState });
  }

  /**
   * Notify renderer process of update events
   * @param channel - IPC channel name
   * @param data - Data to send
   * @private
   */
  _notifyRenderer(channel: string, data: unknown): void {
    try {
      this.windowService.send(channel, data);
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
    if (this.config.isDevelopment) {
      this.logger.info('Skipping update check in development mode');
      this._setState(UpdateState.NOT_AVAILABLE);
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
    const electronApp = getApp();
    if (electronApp) {
      electronApp.isQuitting = true;
    }
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

    // Perform initial check after a short delay (don't block startup)
    const initialCheckTimeoutId = setTimeout(() => {
      this.disposables.cancel(INITIAL_UPDATE_CHECK_LIFECYCLE);
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', (error as Error).message);
      });
    }, 10000); // 10 seconds after startup
    this.disposables.replace(INITIAL_UPDATE_CHECK_LIFECYCLE, () => clearTimeout(initialCheckTimeoutId));

    // Set up periodic checks
    const autoCheckIntervalId = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', (error as Error).message);
      });
    }, intervalMs);
    this.disposables.replace(PERIODIC_UPDATE_CHECK_LIFECYCLE, () => clearInterval(autoCheckIntervalId));

    this.logger.info(`Auto-update check started (interval: ${intervalMs / 1000 / 60} minutes)`);
  }

  /**
   * Stop automatic update checking
   */
  stopAutoCheck(): void {
    const wasRunning = this._autoCheckRunning;
    this.disposables.cancel(INITIAL_UPDATE_CHECK_LIFECYCLE);
    this.disposables.cancel(PERIODIC_UPDATE_CHECK_LIFECYCLE);
    this._autoCheckRunning = false;
    if (wasRunning) {
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
  async dispose(): Promise<void> {
    this.stopAutoCheck();
    await super.dispose();
    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
