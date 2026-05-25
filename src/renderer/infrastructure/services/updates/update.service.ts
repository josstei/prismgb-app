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

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import {
  createPreloadEventBridge,
  type PreloadEventBridge
} from '@renderer/infrastructure/services/preload-event-bridge.factory';
import { UpdateState } from '@shared/config/update-state.config';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateErrorPayload,
  UpdateGetStatusResponse,
  UpdateInfoPayload,
  UpdateInstallResponse,
  UpdateProgressPayload,
  UpdateStatusPayload
} from '@shared/ipc/preload-api.contract.js';

interface UpdateEventBus {
  publish(event: string, payload?: unknown): void;
}

interface UpdateServiceDependencies {
  eventBus: UpdateEventBus;
  loggerFactory: unknown;
}

class UpdateService extends BaseService {
  declare eventBus: UpdateEventBus;
  private _state: string;
  private _updateInfo: UpdateInfoPayload | null;
  private _downloadProgress: UpdateProgressPayload | null;
  private _error: string | UpdateErrorPayload | null;
  private _eventBridge: PreloadEventBridge | null;
  private _initialized: boolean;

  constructor(dependencies: UpdateServiceDependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'UpdateService');

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this._eventBridge = null;
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) {
      this.logger.warn('UpdateService already initialized');
      return;
    }

    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available - updates disabled');
      return;
    }

    this.logger.info('Initializing UpdateService');

    await this._loadInitialStatus();

    this._eventBridge = createPreloadEventBridge({
      api: window.updateAPI,
      bridgeName: 'UpdateService',
      logger: this.logger,
      subscriptions: [
        { id: 'available', subscribe: (api) => api.onAvailable((info) => this._handleAvailable(info)) },
        { id: 'notAvailable', subscribe: (api) => api.onNotAvailable((info) => this._handleNotAvailable(info)) },
        { id: 'progress', subscribe: (api) => api.onProgress((progress) => this._handleProgress(progress)) },
        { id: 'downloaded', subscribe: (api) => api.onDownloaded((info) => this._handleDownloaded(info)) },
        { id: 'error', subscribe: (api) => api.onError((error) => this._handleError(error)) }
      ]
    });

    this._initialized = true;
    this.logger.info('UpdateService initialized');
  }

  async _loadInitialStatus() {
    try {
      const updateAPI = window.updateAPI;
      if (!updateAPI) {
        return;
      }

      const result: UpdateGetStatusResponse = await updateAPI.getStatus();
      if (result) {
        this._state = result.state || UpdateState.IDLE;
        this._updateInfo = result.updateInfo ?? null;
        this._downloadProgress = result.downloadProgress ?? null;
        this._error = result.error ?? null;
      }
    } catch (error) {
      this.logger.warn('Failed to load initial update status', error);
    }
  }

  _handleAvailable(info: UpdateInfoPayload) {
    this.logger.info('Update available', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.AVAILABLE, info);
  }

  _handleNotAvailable(info: UpdateInfoPayload) {
    this.logger.info('No update available');
    this._updateInfo = info;
    this._setState(UpdateState.NOT_AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.NOT_AVAILABLE, info);
  }

  _handleProgress(progress: UpdateProgressPayload) {
    this._downloadProgress = progress;
    this.eventBus.publish(EventChannels.UPDATE.PROGRESS, progress);
  }

  _handleDownloaded(info: UpdateInfoPayload) {
    this.logger.info('Update downloaded', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.DOWNLOADED);
    this.eventBus.publish(EventChannels.UPDATE.DOWNLOADED, info);
  }

  _handleError(error: UpdateErrorPayload) {
    this.logger.error('Update error', error);
    this._error = error;
    this._setState(UpdateState.ERROR);
    this.eventBus.publish(EventChannels.UPDATE.ERROR, error);
  }

  _setState(newState: string) {
    const oldState = this._state;
    this._state = newState;
    this._emitStateChanged();
    this.logger.debug(`State: ${oldState} → ${newState}`);
  }

  _emitStateChanged() {
    this.eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, this.getStatus());
  }

  getStatus(): UpdateStatusPayload {
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

  async checkForUpdates(): Promise<UpdateCheckResponse> {
    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available');
      return { success: false, error: 'Updates not available' };
    }

    this._setState(UpdateState.CHECKING);

    try {
      const result = await window.updateAPI.checkForUpdates();
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Check for updates failed', error);
      this._handleError({ message: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async downloadUpdate(): Promise<UpdateDownloadResponse> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Download update failed', error);
      this._handleError({ message: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  async installUpdate(): Promise<UpdateInstallResponse> {
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Install update failed', error);
      this._handleError({ message: errorMessage });
      return { success: false, error: errorMessage };
    }
  }

  dispose() {
    this._eventBridge?.dispose();
    this._eventBridge = null;

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this._initialized = false;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
