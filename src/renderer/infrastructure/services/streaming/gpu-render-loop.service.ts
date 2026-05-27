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

type VideoFrameCallbackTarget = HTMLVideoElement & {
  requestVideoFrameCallback?: HTMLVideoElement['requestVideoFrameCallback'];
  cancelVideoFrameCallback?: HTMLVideoElement['cancelVideoFrameCallback'];
};

const GPU_RENDER_LOOP_LIFECYCLE = Symbol('gpuRenderLoop');

class StreamingGpuRenderLoopService extends BaseService {
  private _videoElement: HTMLVideoElement | null;
  private _active: boolean;

  constructor(dependencies: GpuRenderLoopDependencies) {
    super(dependencies, ['loggerFactory'], 'StreamingGpuRenderLoopService');
    this._videoElement = null;
    this._active = false;
  }

  start({ videoElement, renderFrame, shouldContinue }: GpuRenderLoopConfig): void {
    const frameCallbackTarget = videoElement as VideoFrameCallbackTarget;
    if (typeof frameCallbackTarget.requestVideoFrameCallback !== 'function') {
      this.logger.warn('requestVideoFrameCallback not available');
      return;
    }

    this.stop();
    this._active = true;
    this._videoElement = videoElement;
    let lastFrameTime = -1;
    const scheduleFrame = () => {
      const rvfcHandle = frameCallbackTarget.requestVideoFrameCallback?.(renderLoop);
      if (typeof rvfcHandle !== 'number') {
        this.stop(videoElement);
        return;
      }
      this.disposables.replace(GPU_RENDER_LOOP_LIFECYCLE, () => {
        frameCallbackTarget.cancelVideoFrameCallback?.(rvfcHandle);
      });
    };

    const renderLoop: VideoFrameRequestCallback = (now, metadata) => {
      this.disposables.cancel(GPU_RENDER_LOOP_LIFECYCLE);
      if (!this._active) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        // Fire-and-forget: backpressure handled by triple buffering in GPU renderer
        // Error handling is internal to renderFrame (try/catch in StreamingGpuRendererService.renderFrame)
        void renderFrame();
        lastFrameTime = frameTime;
      }

      if (shouldContinue()) {
        scheduleFrame();
      } else {
        this.stop(videoElement);
      }
    };

    scheduleFrame();
  }

  stop(_videoElement?: HTMLVideoElement | null): void {
    this._active = false;
    this.disposables.cancel(GPU_RENDER_LOOP_LIFECYCLE);
    this._videoElement = null;
  }

  cleanup(videoElement?: HTMLVideoElement | null): void {
    // Delegate to stop() - handles both cancellation and state reset
    this.stop(videoElement);
  }

  override dispose(): void | Promise<void> {
    this.cleanup(this._videoElement);
    return super.dispose();
  }
}

export { StreamingGpuRenderLoopService };
