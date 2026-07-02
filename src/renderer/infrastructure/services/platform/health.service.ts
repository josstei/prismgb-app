import { BaseService } from '@platform/core';
import type {
  LoggerFactoryLike
} from '@platform/core';

type HealthServiceDependencies = {
  loggerFactory: LoggerFactoryLike;
};

type StreamHealthyPayload = {
  frameTime: number;
};

type StreamUnhealthyPayload = {
  timeoutMs: number;
  reason: 'NO_FRAMES_RECEIVED';
};

type VideoFrameCallbackTarget = HTMLVideoElement & {
  requestVideoFrameCallback?: HTMLVideoElement['requestVideoFrameCallback'];
  cancelVideoFrameCallback?: HTMLVideoElement['cancelVideoFrameCallback'];
};

const HEALTH_TIMEOUT_LIFECYCLE = Symbol('streamHealthTimeout');
const HEALTH_RVFC_LIFECYCLE = Symbol('streamHealthRvfc');
const HEALTH_TIMEUPDATE_LIFECYCLE = Symbol('streamHealthTimeupdate');

/**
 * Stream Health Service
 *
 * Verifies actual video frame delivery using requestVideoFrameCallback.
 * Detects "stream acquired but no frames arriving" when device is powered off.
 *
 * Follows the same lightweight, focused, callback-based pattern as other render helpers.
 * Uses RVFC (already used in GPU render loop) - zero polling overhead.
 */
export class StreamingHealthService extends BaseService {
  private _timeoutMs: number;
  private _isMonitoring: boolean;
  private _firstFrameReceived: boolean;
  private _onHealthy: ((payload: StreamHealthyPayload) => void) | null;
  private _onUnhealthy: ((payload: StreamUnhealthyPayload) => void) | null;
  private _videoElement: HTMLVideoElement | null;

  constructor(dependencies: HealthServiceDependencies) {
    super(dependencies, 'StreamingHealthService');

    this._timeoutMs = 4000;
    this._isMonitoring = false;
    this._firstFrameReceived = false;
    this._onHealthy = null;
    this._onUnhealthy = null;
    this._videoElement = null;

    // Bind methods for event listeners
    this._handleFrameCallback = this._handleFrameCallback.bind(this);
    this._handleTimeUpdate = this._handleTimeUpdate.bind(this);
  }

  checkStreamHealth(
    videoElement: HTMLVideoElement,
    onHealthy: (payload: StreamHealthyPayload) => void,
    onUnhealthy: (payload: StreamUnhealthyPayload) => void,
    timeoutMs = 4000
  ): void {
    if (this._isMonitoring) {
      this.stopMonitoring();
    }

    this._videoElement = videoElement;
    this._onHealthy = onHealthy;
    this._onUnhealthy = onUnhealthy;
    this._timeoutMs = timeoutMs;
    this._isMonitoring = true;
    this._firstFrameReceived = false;

    this.schedule(HEALTH_TIMEOUT_LIFECYCLE, () => this._handleTimeout(), this._timeoutMs);

    // Register for first frame callback
    this._registerFrameCallback();

    this.logger.debug(`Stream health monitoring started (timeout: ${timeoutMs}ms)`);
  }

  _registerFrameCallback(): void {
    if (!this._videoElement || !this._isMonitoring) return;
    const videoElement = this._videoElement as VideoFrameCallbackTarget;

    // Prefer requestVideoFrameCallback (more accurate, synced to video frames)
    if (typeof videoElement.requestVideoFrameCallback === 'function') {
      const rvfcHandle = videoElement.requestVideoFrameCallback(this._handleFrameCallback);
      this.disposables.replace(HEALTH_RVFC_LIFECYCLE, () => {
        videoElement.cancelVideoFrameCallback?.(rvfcHandle);
      });
    } else {
      // Fallback to timeupdate event (fires during playback)
      videoElement.addEventListener('timeupdate', this._handleTimeUpdate, { once: true });
      this.disposables.replace(HEALTH_TIMEUPDATE_LIFECYCLE, () => {
        videoElement.removeEventListener('timeupdate', this._handleTimeUpdate);
      });
    }
  }

  _handleFrameCallback(now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata): void {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this._firstFrameReceived = true;
    this.logger.info('First frame received - stream is healthy');
    this._clearTimeout();

    if (this._onHealthy) {
      this._onHealthy({ frameTime: metadata?.mediaTime ?? now });
    }

    this._cleanup();
  }

  _handleTimeUpdate(): void {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this._firstFrameReceived = true;
    this.logger.info('Playback detected via timeupdate - stream is healthy');
    this._clearTimeout();

    if (this._onHealthy) {
      this._onHealthy({ frameTime: Date.now() });
    }

    this._cleanup();
  }

  _handleTimeout(): void {
    if (!this._isMonitoring || this._firstFrameReceived) return;

    this.logger.warn(`No frames received in ${this._timeoutMs}ms - device may be powered off`);
    this._cancelRvfc();

    if (this._onUnhealthy) {
      this._onUnhealthy({
        timeoutMs: this._timeoutMs,
        reason: 'NO_FRAMES_RECEIVED'
      });
    }

    this._cleanup();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (!this._isMonitoring) return;

    this.logger.debug('Stream health monitoring stopped');
    this._cleanup();
  }

  isMonitoring(): boolean {
    return this._isMonitoring;
  }

  _clearTimeout(): void {
    this.cancelScheduled(HEALTH_TIMEOUT_LIFECYCLE);
  }

  _cancelRvfc(): void {
    this.disposables.cancel(HEALTH_RVFC_LIFECYCLE);
    this.disposables.cancel(HEALTH_TIMEUPDATE_LIFECYCLE);
  }

  _cleanup(): void {
    this._clearTimeout();
    this._cancelRvfc();
    this._isMonitoring = false;
    this._videoElement = null;
    this._onHealthy = null;
    this._onUnhealthy = null;
  }

  /**
   * Full cleanup (for orchestrator disposal)
   */
  cleanup(): void {
    this.stopMonitoring();
  }

  /**
   * Dispose the service
   */
  override dispose(): void | Promise<void> {
    this.cleanup();
    const disposed = super.dispose();
    this.logger.info('StreamingHealthService disposed');
    return disposed;
  }
}
