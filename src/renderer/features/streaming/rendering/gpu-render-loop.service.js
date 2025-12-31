/**
 * GPU Render Loop Service
 *
 * Owns requestVideoFrameCallback loop lifecycle.
 */

import { BaseService } from '@shared/base/service.base.js';

class GpuRenderLoopService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'GpuRenderLoopService');
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

    const renderLoop = async (now, metadata) => {
      if (!this._active) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        await renderFrame();
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

    if (this._rvfcHandle !== null && videoElement?.cancelVideoFrameCallback) {
      videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }
  }

  cleanup(videoElement) {
    this._active = false;
    // Cancel any pending RVFC handle before nulling
    if (this._rvfcHandle !== null && videoElement?.cancelVideoFrameCallback) {
      videoElement.cancelVideoFrameCallback(this._rvfcHandle);
    }
    this._rvfcHandle = null;
  }
}

export { GpuRenderLoopService };
