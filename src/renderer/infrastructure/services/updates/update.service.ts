
import { BaseService, getErrorMessage } from '@platform/core';
import { EventChannels } from '@platform/events';
import { createTrpcEventBridge } from '@renderer/infrastructure/services/platform/trpc-event-bridge.factory';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { UpdateState } from '@platform/config';
import type { UpdateStateValue } from '@platform/config';
import type { EventPublisherLike, LoggerFactoryLike } from '@platform/core';

import type {
  UpdateCheckPayload,
  UpdateErrorPayload,
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateStatusPayload
} from '@platform/ipc';

const UPDATE_SUBSCRIPTION_LIFECYCLE = Symbol('updateSubscriptionLifecycle');

type UpdateStatusSnapshot = UpdateStatusPayload & {
  state: UpdateStateValue;
};

type UpdateServiceDependencies = {
  eventBus: EventPublisherLike;
  loggerFactory: LoggerFactoryLike;
};

class UpdateService extends BaseService {
  private _state: UpdateStateValue;
  private _updateInfo: UpdateInfoPayload | null;
  private _downloadProgress: UpdateProgressPayload | null;
  private _error: string | UpdateErrorPayload | null;
  private revision = 0;
  private closing = false;
  private lifetime = {};

  private readonly eventBus: EventPublisherLike;

  constructor({ eventBus, loggerFactory }: UpdateServiceDependencies) {
    super({ loggerFactory }, 'UpdateService');
    this.eventBus = eventBus;

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
  }

  protected override async onInitialize(): Promise<void> {
    this.closing = false;
    this.lifetime = {};
    this.revision++;
    this.logger.info('Initializing UpdateService');

    this.disposables.replace(UPDATE_SUBSCRIPTION_LIFECYCLE, createTrpcEventBridge('UpdateService', [
      () => trpcClient.update.onAvailable.subscribe(undefined, { onData: (info) => this._handleAvailable(info) }),
      () => trpcClient.update.onNotAvailable.subscribe(undefined, { onData: (info) => this._handleNotAvailable(info) }),
      () => trpcClient.update.onProgress.subscribe(undefined, { onData: (progress) => this._handleProgress(progress) }),
      () => trpcClient.update.onDownloaded.subscribe(undefined, { onData: (info) => this._handleDownloaded(info) }),
      () => trpcClient.update.onError.subscribe(undefined, { onData: (error) => this._handleError(error) })
    ], this.logger));

    await this._loadInitialStatus();

    this.logger.info('UpdateService initialized');
  }

  async _loadInitialStatus() {
    const revision = ++this.revision;
    try {
      const result = await trpcClient.update.getStatus.query();
      if (result && !this.closing && revision === this.revision) {
        this._state = result.state || UpdateState.IDLE;
        this._updateInfo = result.updateInfo ?? null;
        this._downloadProgress = result.downloadProgress ?? null;
        this._error = result.error ?? null;
        this._emitStateChanged();
        if (this._state === UpdateState.AVAILABLE || this._state === UpdateState.DOWNLOADED) this._publishFeedback();
      }
    } catch (error) {
      this.logger.warn('Failed to load initial update status', error);
    }
  }

  _handleAvailable(info: UpdateInfoPayload) {
    if (this.closing) return;
    this.logger.info('Update available', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.AVAILABLE);
  }

  _handleNotAvailable(info: UpdateInfoPayload) {
    if (this.closing) return;
    this.logger.info('No update available');
    this._updateInfo = info;
    this._setState(UpdateState.NOT_AVAILABLE);
  }

  _handleProgress(progress: UpdateProgressPayload) {
    if (this.closing) return;
    this.revision++;
    this._downloadProgress = progress;
    if (this._state !== UpdateState.DOWNLOADING) this._setState(UpdateState.DOWNLOADING);
    this.logger.debug('Download progress', { percent: progress.percent?.toFixed(1) });
    this.eventBus.publish(EventChannels.UPDATE.PROGRESS, progress);
  }

  _handleDownloaded(info: UpdateInfoPayload) {
    if (this.closing) return;
    this.logger.info('Update downloaded', { version: info?.version });
    this._updateInfo = info;
    this._setState(UpdateState.DOWNLOADED);
  }

  _handleError(error: UpdateErrorPayload) {
    if (this.closing) return;
    this.logger.error('Update error', error);
    this._error = error;
    this._setState(UpdateState.ERROR);
  }

  _reconcileCheckResult(result: UpdateCheckPayload): void {
    if (this._state !== UpdateState.CHECKING) {
      return;
    }

    if (result.updateAvailable === false) {
      this._handleNotAvailable({
        ...(result.updateInfo ?? {}),
        reason: result.reason
      });
      return;
    }

    if (result.updateAvailable === true && result.updateInfo) {
      this._handleAvailable(result.updateInfo);
    }
  }

  _setState(newState: UpdateStateValue) {
    this.revision++;
    const oldState = this._state;
    this._state = newState;
    this._emitStateChanged();
    this._publishFeedback();
    this.logger.debug(`State: ${oldState} → ${newState}`);
  }

  _emitStateChanged() {
    this.eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, this.getStatus());
  }

  private _publishFeedback(): void {
    const version = this._updateInfo?.version ?? 'unknown';
    const feedbackByState: Partial<Record<UpdateStateValue, { message: string; type: 'info' | 'success' | 'error'; badge: boolean }>> = {
      [UpdateState.AVAILABLE]: { message: `Update v${version} available`, type: 'info', badge: true },
      [UpdateState.NOT_AVAILABLE]: { message: "You're up to date", type: 'success', badge: false },
      [UpdateState.DOWNLOADED]: { message: `Update v${version} ready to install`, type: 'success', badge: true },
      [UpdateState.ERROR]: { message: `Update failed: ${getErrorMessage(this._error)}`, type: 'error', badge: false }
    };
    const feedback = feedbackByState[this._state];
    if (!feedback) return;
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: feedback.message, type: feedback.type });
    this.eventBus.publish(feedback.badge ? EventChannels.UPDATE.BADGE_SHOW : EventChannels.UPDATE.BADGE_HIDE);
  }

  getStatus(): UpdateStatusSnapshot {
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

  async checkForUpdates(): Promise<void> {
    if (this.closing) return;
    this._setState(UpdateState.CHECKING);
    const revision = this.revision;

    try {
      const result = await trpcClient.update.checkForUpdates.mutate();
      if (!this.closing && revision === this.revision) this._reconcileCheckResult(result);
    } catch (error) {
      if (this.closing || revision !== this.revision) return;
      const errorMessage = getErrorMessage(error);
      this.logger.error('Check for updates failed', error);
      this._handleError({ message: errorMessage });
    }
  }

  async downloadUpdate(): Promise<void> {
    if (this.closing) return;
    if (this._state !== UpdateState.AVAILABLE) {
      this.logger.warn('No update available to download');
      return;
    }

    this._setState(UpdateState.DOWNLOADING);
    const lifetime = this.lifetime;

    try {
      await trpcClient.update.downloadUpdate.mutate();
    } catch (error) {
      if (this.closing || lifetime !== this.lifetime || this.state !== UpdateState.DOWNLOADING) return;
      const errorMessage = getErrorMessage(error);
      this.logger.error('Download update failed', error);
      this._handleError({ message: errorMessage });
    }
  }

  async installUpdate(): Promise<void> {
    if (this.closing) return;
    if (this._state !== UpdateState.DOWNLOADED) {
      this.logger.warn('No update downloaded to install');
      return;
    }

    this.logger.info('Installing update and restarting...');
    const lifetime = this.lifetime;

    try {
      await trpcClient.update.installUpdate.mutate();
    } catch (error) {
      if (this.closing || lifetime !== this.lifetime || this._state !== UpdateState.DOWNLOADED) return;
      const errorMessage = getErrorMessage(error);
      this.logger.error('Install update failed', error);
      this._handleError({ message: errorMessage });
    }
  }

  override dispose(): void | Promise<void> {
    this.closing = true;
    this.lifetime = {};
    this.revision++;
    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this.logger.info('UpdateService disposed');
    return super.dispose();
  }
}

export { UpdateService };
