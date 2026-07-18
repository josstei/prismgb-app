import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels, OnEvent } from '@platform/events';
import type { StreamStartedPayload } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';
import type { AppState } from '@renderer/application/state/app-state.js';

type StreamingAudioPipelineServiceLike = {
  start(stream: MediaStream): Promise<boolean>;
  stop(): void;
};

type StreamViewServiceLike = {
  setMuted(muted: boolean): void;
};

type AppStateLike = Pick<AppState, 'isStreaming'>;

@injectable()
export class StreamingAudioOrchestrator extends BaseOrchestrator {
  private _activeStream: MediaStream | null;
  private _fallbackUnmuted: boolean;

  constructor(
    @inject(TOKENS.streamingAudioPipelineService) private readonly streamingAudioPipelineService: StreamingAudioPipelineServiceLike,
    @inject(TOKENS.streamViewService) private readonly streamViewService: StreamViewServiceLike,
    @inject(TOKENS.appState) private readonly appState: AppStateLike,
    @inject(TOKENS.eventBus) eventBus: EventBusLike,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike
  ) {
    super({ loggerFactory, eventBus }, 'StreamingAudioOrchestrator');

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
