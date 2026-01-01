/**
 * Update Service (Main)
 * Handles automatic updates using electron-updater
 * Manages update checking, downloading, and installation
 */

import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { BaseService } from '@shared/base/service.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.js';
import { MainEventChannels } from '@main/infrastructure/events/event-channels.js';

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
};

class UpdateService extends BaseService {
  constructor(dependencies) {
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
  initialize() {
    if (this._initialized) {
      this.logger.warn('UpdateService already initialized');
      return;
    }

    this.logger.info('Initializing update service');

    // Configure autoUpdater
    autoUpdater.logger = {
      info: (msg) => this.logger.info(msg),
      warn: (msg) => this.logger.warn(msg),
      error: (msg) => this.logger.error(msg),
      debug: (msg) => this.logger.debug(msg)
    };

    // Don't auto-download updates - let user decide
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;

    // Allow pre-release updates if running a beta version
    const version = this.config?.version || '';
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
  _setupEventListeners() {
    autoUpdater.on('checking-for-update', () => {
      this.logger.info('Checking for updates...');
      this._setState(UpdateState.CHECKING);
    });

    autoUpdater.on('update-available', (info) => {
      this.logger.info('Update available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.AVAILABLE, info);
    });

    autoUpdater.on('update-not-available', (info) => {
      this.logger.info('No updates available', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.NOT_AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, info);
    });

    autoUpdater.on('download-progress', (progress) => {
      this.logger.debug('Download progress', {
        percent: progress.percent?.toFixed(1),
        transferred: progress.transferred,
        total: progress.total
      });
      this.downloadProgress = progress;
      this._notifyRenderer(IPC_CHANNELS.UPDATE.PROGRESS, progress);
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.logger.info('Update downloaded', { version: info.version });
      this.updateInfo = info;
      this._setState(UpdateState.DOWNLOADED);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.DOWNLOADED, info);
    });

    autoUpdater.on('error', (error) => {
      this.logger.error('Update error', error);
      this.error = error;
      this._setState(UpdateState.ERROR);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.ERROR, { message: error.message });
    });
  }

  /**
   * Update internal state and publish event
   * @param {string} newState - New state value
   * @private
   */
  _setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.eventBus.publish(MainEventChannels.UPDATE.STATE_CHANGED, { oldState, newState });
  }

  /**
   * Notify renderer process of update events
   * @param {string} channel - IPC channel name
   * @param {Object} data - Data to send
   * @private
   */
  _notifyRenderer(channel, data) {
    try {
      this.windowService?.send(channel, data);
    } catch (error) {
      this.logger.warn('Failed to notify renderer', { channel, error: error.message });
    }
  }

  /**
   * Check for updates
   * @param {Object} options - Check options
   * @param {boolean} options.force - Force check even if already downloaded/downloading
   * @returns {Promise<Object>} Update check result
   */
  async checkForUpdates({ force = false } = {}) {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    // Skip if already downloaded or downloading (unless forced by user)
    if (!force && (this.state === UpdateState.DOWNLOADED || this.state === UpdateState.DOWNLOADING)) {
      this.logger.info('Skipping update check - update already in progress or downloaded');
      return { updateAvailable: true, updateInfo: this.updateInfo, skipped: true };
    }

    // Skip in development mode
    if (this.config?.isDevelopment) {
      this.logger.info('Skipping update check in development mode');
      this._setState(UpdateState.NOT_AVAILABLE);
      this._notifyRenderer(IPC_CHANNELS.UPDATE.NOT_AVAILABLE, { version: this.config?.version, reason: 'development' });
      return { updateAvailable: false, reason: 'development' };
    }

    try {
      this.logger.info('Checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return {
        updateAvailable: result?.updateInfo?.version !== this.config?.version,
        updateInfo: result?.updateInfo
      };
    } catch (error) {
      this.logger.error('Failed to check for updates', error);
      throw error;
    }
  }

  /**
   * Download available update
   * @returns {Promise<void>}
   */
  async downloadUpdate() {
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
      this.logger.error('Failed to download update', error);
      this._setState(UpdateState.ERROR);
      this.error = error;
      throw error;
    }
  }

  /**
   * Install downloaded update and restart app
   */
  installUpdate() {
    if (!this._initialized) {
      throw new Error('UpdateService not initialized');
    }

    if (this.state !== UpdateState.DOWNLOADED) {
      throw new Error('No update downloaded to install');
    }

    this.logger.info('Installing update and restarting...');
    app.isQuitting = true;
    autoUpdater.quitAndInstall(false, true);
  }

  /**
   * Start automatic update checking at specified interval
   * @param {number} intervalMs - Check interval in milliseconds (default: 1 hour)
   */
  startAutoCheck(intervalMs = 60 * 60 * 1000) {
    if (this._autoCheckIntervalId) {
      this.logger.warn('Auto-check already running');
      return;
    }

    // Perform initial check after a short delay (don't block startup)
    this._initialCheckTimeoutId = setTimeout(() => {
      this._initialCheckTimeoutId = null;
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', error.message);
      });
    }, 10000); // 10 seconds after startup

    // Set up periodic checks
    this._autoCheckIntervalId = setInterval(() => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', error.message);
      });
    }, intervalMs);

    this.logger.info(`Auto-update check started (interval: ${intervalMs / 1000 / 60} minutes)`);
  }

  /**
   * Stop automatic update checking
   */
  stopAutoCheck() {
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
   * @returns {Object} Current status object
   */
  getStatus() {
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
  dispose() {
    this.stopAutoCheck();
    autoUpdater.removeAllListeners();
    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
