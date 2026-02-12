/**
 * GPU Render Loop Service
 *
 * Owns requestVideoFrameCallback loop lifecycle.
 */

import { BaseService } from '@prismgb/core';

class StreamingGpuRenderLoopService extends BaseService {
  static readonly dependencies = ['loggerFactory'] as const;

  constructor(dependencies) {
    super(dependencies, [...StreamingGpuRenderLoopService.dependencies], 'StreamingGpuRenderLoopService');
    this._rvfcHandle = null;
    this._active = false;
  }

  start({ videoElement, renderFrame, shouldContinue }) {
    if (!videoElement?.requestVideoFrameCallback) {
      this.logger.warn('requestVideoFrameCallback not available');
      return;
    }

    this._active = true;
    let lastFrameTime = -1;

    const renderLoop = (now, metadata) => {
      if (!this._active) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        // Fire-and-forget: backpressure handled by triple buffering in GPU renderer
        // Error handling is internal to renderFrame (try/catch in StreamingGpuRendererService.renderFrame)
        renderFrame();
        lastFrameTime = frameTime;
      }

      if (shouldContinue()) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderLoop);
      }
    };

    this._rvfcHandle = videoElement.requestVideoFrameCallback(renderLoop);
  }

  stop(videoElement) {
    this._active = false;

    if (this._rvfcHandle !== null) {
      if (videoElement?.cancelVideoFrameCallback) {
        videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      }
      this._rvfcHandle = null;
    }
  }

  cleanup(videoElement) {
    // Delegate to stop() - handles both cancellation and state reset
    this.stop(videoElement);
  }
}

export { StreamingGpuRenderLoopService };
