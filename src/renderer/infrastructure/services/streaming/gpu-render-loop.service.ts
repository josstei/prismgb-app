/**
 * GPU Render Loop Service
 *
 * Owns requestVideoFrameCallback loop lifecycle.
 */

import { BaseService } from '@shared/base/service.base.js';
import type {
  LoggerFactoryLike
} from '@shared/interfaces/infrastructure.types.js';

type GpuRenderLoopDependencies = {
  loggerFactory: LoggerFactoryLike;
};

type GpuRenderLoopConfig = {
  videoElement: HTMLVideoElement;
  renderFrame: () => void | Promise<void>;
  shouldContinue: () => boolean;
};

class StreamingGpuRenderLoopService extends BaseService {
  private _rvfcHandle: number | null;
  private _active: boolean;

  constructor(dependencies: GpuRenderLoopDependencies) {
    super(dependencies, ['loggerFactory'], 'StreamingGpuRenderLoopService');
    this._rvfcHandle = null;
    this._active = false;
  }

  start({ videoElement, renderFrame, shouldContinue }: GpuRenderLoopConfig): void {
    if (!videoElement?.requestVideoFrameCallback) {
      this.logger.warn('requestVideoFrameCallback not available');
      return;
    }

    this._active = true;
    let lastFrameTime = -1;

    const renderLoop: VideoFrameRequestCallback = (now, metadata) => {
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

  stop(videoElement?: HTMLVideoElement | null): void {
    this._active = false;

    if (this._rvfcHandle !== null) {
      if (videoElement?.cancelVideoFrameCallback) {
        videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      }
      this._rvfcHandle = null;
    }
  }

  cleanup(videoElement?: HTMLVideoElement | null): void {
    // Delegate to stop() - handles both cancellation and state reset
    this.stop(videoElement);
  }
}

export { StreamingGpuRenderLoopService };
