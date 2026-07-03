import { injectable, inject } from 'inversify';
import { BaseOrchestrator } from '@platform/core';
import { EventChannels } from '@platform/events';
import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens.js';

type StreamingAudioPipelineServiceLike = {
  start(stream: MediaStream): Promise<boolean>;
  stop(): void;
};

type StreamViewServiceLike = {
  setMuted(muted: boolean): void;
};

type AppStateLike = {
  readonly isStreaming: boolean;
};

function resolveStreamFromPayload(data: unknown): MediaStream | null {
  if (typeof data !== 'object' || data === null || !('stream' in data)) {
    return null;
  }

  const stream = (data as { stream?: unknown }).stream;
  if (typeof stream !== 'object' || stream === null || !('getAudioTracks' in stream)) {
    return null;
  }

  return typeof stream.getAudioTracks === 'function'
    ? stream as MediaStream
    : null;
}

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

  /**
   * Initialize audio orchestrator
   */
  async onInitialize(): Promise<void> {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data) => this._handleStreamStarted(data),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: () => this._handleStreamStopped()
    });
  }

  _handleStreamStarted(data: unknown): void {
    const stream = resolveStreamFromPayload(data);
    if (!stream) return;

    if (this._activeStream === stream) {
      this.logger.debug('Audio pipeline already attached to stream; skipping re-init');
      return;
    }

    this._activeStream = stream;
    this._fallbackUnmuted = false;
    this._initializeAudioPipeline(stream);
  }

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
