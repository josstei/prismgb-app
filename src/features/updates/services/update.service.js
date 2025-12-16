/**
 * Update Service (Renderer)
 *
 * Bridges window.updateAPI (preload) with EventBus for renderer-side update handling.
 * Tracks update state and re-emits IPC events as EventBus events.
 *
 * Events emitted:
 * - 'update:available' - Update is available
 * - 'update:not-available' - No update available
 * - 'update:progress' - Download progress
 * - 'update:downloaded' - Update downloaded and ready
 * - 'update:error' - Update error occurred
 * - 'update:state-changed' - State transition
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

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
    super(dependencies, ['eventBus', 'loggerFactory'], 'UpdateService');

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this._cleanupFns = [];
    this._initialized = false;
  }

  initialize() {
    if (this._initialized) {
      this.logger.warn('UpdateService already initialized');
      return;
    }

    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available - updates disabled');
      return;
    }

    this.logger.info('Initializing UpdateService');

    this._cleanupFns.push(
      window.updateAPI.onAvailable((info) => this._handleAvailable(info)),
      window.updateAPI.onNotAvailable((info) => this._handleNotAvailable(info)),
      window.updateAPI.onProgress((progress) => this._handleProgress(progress)),
      window.updateAPI.onDownloaded((info) => this._handleDownloaded(info)),
      window.updateAPI.onError((error) => this._handleError(error))
    );

    this._initialized = true;
    this.logger.info('UpdateService initialized');

    this._loadInitialStatus();
  }

  async _loadInitialStatus() {
    try {
      const result = await window.updateAPI.getStatus();
      if (result) {
        this._state = result.state || UpdateState.IDLE;
        this._updateInfo = result.updateInfo;
        this._downloadProgress = result.downloadProgress;
        this._error = result.error;
        this._emitStateChanged();
      }
    } catch (error) {
      this.logger.warn('Failed to load initial update status', error.message);
    }
  }

  _handleAvailable(info) {
    this.logger.info('Update available', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.AVAILABLE, info);
  }

  _handleNotAvailable(info) {
    this.logger.info('No update available');
    this._updateInfo = info;
    this._setState(UpdateState.NOT_AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.NOT_AVAILABLE, info);
  }

  _handleProgress(progress) {
    this._downloadProgress = progress;
    this.eventBus.publish(EventChannels.UPDATE.PROGRESS, progress);
  }

  _handleDownloaded(info) {
    this.logger.info('Update downloaded', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.DOWNLOADED);
    this.eventBus.publish(EventChannels.UPDATE.DOWNLOADED, info);
  }

  _handleError(error) {
    this.logger.error('Update error', error);
    this._error = error;
    this._setState(UpdateState.ERROR);
    this.eventBus.publish(EventChannels.UPDATE.ERROR, error);
  }

  _setState(newState) {
    const oldState = this._state;
    this._state = newState;
    this._emitStateChanged();
    this.logger.debug(`State: ${oldState} → ${newState}`);
  }

  _emitStateChanged() {
    this.eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, this.getStatus());
  }

  getStatus() {
    return {
      state: this._state,
      updateInfo: this._updateInfo,
      downloadProgress: this._downloadProgress,
      error: this._error
    };
  }

  get state() {
    return this._state;
  }

  get updateInfo() {
    return this._updateInfo;
  }

  async checkForUpdates() {
    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available');
      return { success: false, error: 'Updates not available' };
    }

    this._setState(UpdateState.CHECKING);

    // Force browser to paint the CHECKING state before continuing
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Minimum visible time for checking state (dev mode returns instantly)
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const result = await window.updateAPI.checkForUpdates();
      return result;
    } catch (error) {
      this.logger.error('Check for updates failed', error);
      this._handleError({ message: error.message });
      return { success: false, error: error.message };
    }
  }

  async downloadUpdate() {
    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available');
      return { success: false, error: 'Updates not available' };
    }

    if (this._state !== UpdateState.AVAILABLE) {
      this.logger.warn('No update available to download');
      return { success: false, error: 'No update available' };
    }

    this._setState(UpdateState.DOWNLOADING);

    try {
      const result = await window.updateAPI.downloadUpdate();
      return result;
    } catch (error) {
      this.logger.error('Download update failed', error);
      this._handleError({ message: error.message });
      return { success: false, error: error.message };
    }
  }

  async installUpdate() {
    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available');
      return { success: false, error: 'Updates not available' };
    }

    if (this._state !== UpdateState.DOWNLOADED) {
      this.logger.warn('No update downloaded to install');
      return { success: false, error: 'No update downloaded' };
    }

    this.logger.info('Installing update and restarting...');

    try {
      const result = await window.updateAPI.installUpdate();
      return result;
    } catch (error) {
      this.logger.error('Install update failed', error);
      this._handleError({ message: error.message });
      return { success: false, error: error.message };
    }
  }

  dispose() {
    this._cleanupFns.forEach(fn => {
      if (typeof fn === 'function') fn();
    });
    this._cleanupFns = [];

    window.updateAPI?.removeListeners();

    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
