/**
 * Streaming Audio Orchestrator
 *
 * Coordinates audio pipeline lifecycle for active streams.
 * Keeps audio warm-up and fallback handling isolated from streaming orchestration.
 */

import { BaseOrchestrator } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';

export class StreamingAudioOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'streamingAudioPipelineService',
    'streamingCanvasService',
    'appState',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(
      dependencies,
      [...StreamingAudioOrchestrator.dependencies],
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

  _handleStreamStarted(data) {
    const stream = data?.stream;
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

  /**
   * Initialize audio pipeline with fallback to video element audio
   * @param {MediaStream} stream - The media stream
   * @private
   */
  _initializeAudioPipeline(stream) {
    const hasAudio = stream?.getAudioTracks?.().length > 0;

    this.streamingAudioPipelineService.start(stream)
      .then((ready) => {
        if (this._activeStream !== stream) return;
        if (ready || !hasAudio || !this.appState.isStreaming) return;
        this._applyVideoAudioFallback();
      })
      .catch((error) => {
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
    this.streamingCanvasService.setMuted(false);
  }
}
