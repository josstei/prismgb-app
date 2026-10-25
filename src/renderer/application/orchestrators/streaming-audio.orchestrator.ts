
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { StreamStartedPayload } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';

import type { AppState } from '@renderer/application/state/app-state.js';

type StreamingAudioPipelineServiceLike = {
  start(stream: MediaStream): Promise<boolean>;
  stop(): void;
};

type StreamViewServiceLike = {
  setMuted(muted: boolean): void;
};

type AppStateLike = Pick<AppState, 'isStreaming'>;

type StreamingAudioOrchestratorDependencies = {
  streamingAudioPipelineService: StreamingAudioPipelineServiceLike;
  streamViewService: StreamViewServiceLike;
  appState: AppStateLike;
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
};

export class StreamingAudioOrchestrator extends BaseOrchestrator {
  private _activeStream: MediaStream | null;
  private _fallbackUnmuted: boolean;

  private readonly streamingAudioPipelineService: StreamingAudioPipelineServiceLike;
  private readonly streamViewService: StreamViewServiceLike;
  private readonly appState: AppStateLike;

  constructor({ streamingAudioPipelineService, streamViewService, appState, eventBus, loggerFactory }: StreamingAudioOrchestratorDependencies) {
    super({ loggerFactory, eventBus }, 'StreamingAudioOrchestrator');
    this.streamingAudioPipelineService = streamingAudioPipelineService;
    this.streamViewService = streamViewService;
    this.appState = appState;

    this._activeStream = null;
    this._fallbackUnmuted = false;
  }

  @OnEvent(EventChannels.STREAM.STARTED)
  _handleStreamStarted(data: StreamStartedPayload): void {
    const stream = data.stream;

    if (this._activeStream === stream) {
      this.logger.debug('Audio pipeline already attached to stream; skipping re-init');
      return;
    }

    this._activeStream = stream;
    this._fallbackUnmuted = false;
    this._initializeAudioPipeline(stream);
  }

  @OnEvent(EventChannels.STREAM.STOPPED)
  @OnEvent(EventChannels.STREAM.ERROR)
  _handleStreamStopped(): void {
    this._activeStream = null;
    this._fallbackUnmuted = false;
    this.streamingAudioPipelineService.stop();
  }

  _initializeAudioPipeline(stream: MediaStream): void {
    const hasAudio = stream?.getAudioTracks?.().length > 0;

    this.streamingAudioPipelineService.start(stream)
      .then((ready: boolean) => {
        if (this._activeStream !== stream) return;
        if (ready || !hasAudio || !this.appState.isStreaming) return;
        this._applyVideoAudioFallback();
      })
      .catch((error: unknown) => {
        if (this._activeStream !== stream) return;
        if (hasAudio && this.appState.isStreaming) {
          this.logger.warn('Audio warm-up error - falling back to video element audio', error);
          this._applyVideoAudioFallback();
        }
      });
  }

  _applyVideoAudioFallback(): void {
    if (this._fallbackUnmuted) return;
    this._fallbackUnmuted = true;
    this.logger.warn('Audio warm-up failed - falling back to video element audio');
    this.streamViewService.setMuted(false);
  }
}
