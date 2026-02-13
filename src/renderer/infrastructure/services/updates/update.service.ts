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

import { IPCBridgeBase } from '@renderer/infrastructure/bridges/ipc-bridge.base';
import { EventChannels } from '@renderer/common/config/event-channels';
import { UpdateState } from '@renderer/common/config/update-state.config';
import type { IPCMapping, IPCApi } from '@renderer/infrastructure/bridges/ipc-bridge.base';
import type {
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateErrorPayload,
  UpdateInfoPayload,
  UpdateInstallResponse,
  UpdateProgressPayload,
  UpdateStatusPayload
} from '@prismgb/ipc';

export { UpdateState };

class UpdateService extends IPCBridgeBase {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...UpdateService.dependencies], 'UpdateService');

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
  }

  protected getIPCApi(): IPCApi | undefined {
    return window.updateAPI;
  }

  protected getMappings(): IPCMapping[] {
    return [
      { apiMethod: 'onAvailable', eventChannel: EventChannels.UPDATE.AVAILABLE },
      { apiMethod: 'onNotAvailable', eventChannel: EventChannels.UPDATE.NOT_AVAILABLE },
      { apiMethod: 'onProgress', eventChannel: EventChannels.UPDATE.PROGRESS },
      { apiMethod: 'onDownloaded', eventChannel: EventChannels.UPDATE.DOWNLOADED },
      { apiMethod: 'onError', eventChannel: EventChannels.UPDATE.ERROR }
    ];
  }

  protected createHandler(mapping: IPCMapping): (data: unknown) => void {
    switch (mapping.apiMethod) {
      case 'onAvailable':
        return (data: unknown) => this._handleAvailable(data as UpdateInfoPayload);
      case 'onNotAvailable':
        return (data: unknown) => this._handleNotAvailable(data as UpdateInfoPayload);
      case 'onProgress':
        return (data: unknown) => this._handleProgress(data as UpdateProgressPayload);
      case 'onDownloaded':
        return (data: unknown) => this._handleDownloaded(data as UpdateInfoPayload);
      case 'onError':
        return (data: unknown) => this._handleError(data as UpdateErrorPayload);
      default:
        return super.createHandler(mapping);
    }
  }

  async initialize() {
    if (!window.updateAPI) {
      this.logger.warn('updateAPI not available - updates disabled');
      return;
    }

    await super.initialize();
  }

  async onInitialize() {
    await this._loadInitialStatus();
    await super.onInitialize();
  }

  async _loadInitialStatus() {
    try {
      const result = await window.updateAPI.getStatus();
      if (result) {
        this._state = result.state || UpdateState.IDLE;
        this._updateInfo = result.updateInfo;
        this._downloadProgress = result.downloadProgress;
        this._error = result.error;
      }
    } catch (error) {
      this.logger.warn('Failed to load initial update status', error);
    }
  }

  private _handleAvailable(info: UpdateInfoPayload) {
    this.logger.info('Update available', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.AVAILABLE, info);
  }

  private _handleNotAvailable(info: UpdateInfoPayload) {
    this.logger.info('No update available');
    this._updateInfo = info;
    this._setState(UpdateState.NOT_AVAILABLE);
    this.eventBus.publish(EventChannels.UPDATE.NOT_AVAILABLE, info);
  }

  private _handleProgress(progress: UpdateProgressPayload) {
    this._downloadProgress = progress;
    this.eventBus.publish(EventChannels.UPDATE.PROGRESS, progress);
  }

  private _handleDownloaded(info: UpdateInfoPayload) {
    this.logger.info('Update downloaded', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.DOWNLOADED);
    this.eventBus.publish(EventChannels.UPDATE.DOWNLOADED, info);
  }

  private _handleError(error: UpdateErrorPayload) {
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

  async onDispose() {
    await super.onDispose();

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this.logger.info('UpdateService disposed');
  }
}

export { UpdateService };
