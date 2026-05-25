/**
 * Streaming Audio Orchestrator
 *
 * Coordinates audio pipeline lifecycle for active streams.
 * Keeps audio warm-up and fallback handling isolated from streaming orchestration.
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

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

export class StreamingAudioOrchestrator extends BaseOrchestrator {
  constructor(dependencies: Record<string, unknown>) {
    super(
      dependencies,
      ['streamingAudioPipelineService', 'streamViewService', 'appState', 'eventBus', 'loggerFactory'],
      'StreamingAudioOrchestrator'
    );

    this._activeStream = null;
    this._fallbackUnmuted = false;
  }

  /**
   * Initialize audio orchestrator
   */
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data) => this._handleStreamStarted(data),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: () => this._handleStreamStopped()
    });
  }

  _handleStreamStarted(data: unknown) {
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

  _handleStreamStopped() {
    this._activeStream = null;
    this._fallbackUnmuted = false;
    this.streamingAudioPipelineService.stop();
  }

  _initializeAudioPipeline(stream: MediaStream) {
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

  _applyVideoAudioFallback() {
    if (this._fallbackUnmuted) return;
    this._fallbackUnmuted = true;
    this.logger.warn('Audio warm-up failed - falling back to video element audio');
    this.streamViewService.setMuted(false);
  }
}
