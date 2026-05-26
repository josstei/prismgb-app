import { BaseService } from '@shared/base/service.base.js';
import type {
  LoggerFactoryLike
} from '@shared/interfaces/infrastructure.types.js';

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
  private _timeoutHandle: ReturnType<typeof setTimeout> | null;
  private _rvfcHandle: number | null;
  private _firstFrameReceived: boolean;
  private _onHealthy: ((payload: StreamHealthyPayload) => void) | null;
  private _onUnhealthy: ((payload: StreamUnhealthyPayload) => void) | null;
  private _videoElement: HTMLVideoElement | null;

  constructor(dependencies: HealthServiceDependencies) {
    super(dependencies, ['loggerFactory'], 'StreamingHealthService');

    this._timeoutMs = 4000;
    this._isMonitoring = false;
    this._timeoutHandle = null;
    this._rvfcHandle = null;
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

    // Start timeout
    this._timeoutHandle = setTimeout(() => this._handleTimeout(), this._timeoutMs);

    // Register for first frame callback
    this._registerFrameCallback();

    this.logger.debug(`Stream health monitoring started (timeout: ${timeoutMs}ms)`);
  }

  _registerFrameCallback(): void {
    if (!this._videoElement || !this._isMonitoring) return;

    // Prefer requestVideoFrameCallback (more accurate, synced to video frames)
    if (this._videoElement.requestVideoFrameCallback) {
      this._rvfcHandle = this._videoElement.requestVideoFrameCallback(this._handleFrameCallback);
    } else {
      // Fallback to timeupdate event (fires during playback)
      this._videoElement.addEventListener('timeupdate', this._handleTimeUpdate, { once: true });
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
    if (this._timeoutHandle !== null) {
      clearTimeout(this._timeoutHandle);
      this._timeoutHandle = null;
    }
  }

  _cancelRvfc(): void {
    // Cancel RVFC if active
    if (this._rvfcHandle !== null && this._videoElement?.cancelVideoFrameCallback) {
      this._videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }

    // Remove fallback event listener
    if (this._videoElement) {
      this._videoElement.removeEventListener('timeupdate', this._handleTimeUpdate);
    }
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
  dispose(): void {
    this.cleanup();
    this.logger.info('StreamingHealthService disposed');
  }
}
