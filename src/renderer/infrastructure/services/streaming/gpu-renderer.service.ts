/**
 * GPU Renderer Service
 *
 * Main thread service that coordinates GPU-accelerated rendering.
 * Delegates worker lifecycle to GpuWorkerManager and handles domain-specific
 * concerns: frame submission, preset management, capture, and fallback.
 *
 * Features:
 * - Automatic capability detection
 * - Worker-based rendering with OffscreenCanvas
 * - Triple buffering to prevent frame drops
 * - Seamless preset switching
 * - Graceful fallback chain
 */

import { BaseService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';
import { CapabilityDetector } from '@renderer/infrastructure/rendering/capability-detector.utils';
import {
  WorkerMessageType,
  WorkerResponseType
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import { PresetRegistry, UniformContext } from '@prismgb/gpu';

/**
 * Maximum number of frames that can be pending render
 * This implements triple buffering
 */
const MAX_PENDING_FRAMES = 2;

/**
 * Native resolution of the Chromatic device
 */
const NATIVE_WIDTH = 160;
const NATIVE_HEIGHT = 144;

/**
 * Frozen options for createImageBitmap to avoid per-frame allocation
 */
const BITMAP_OPTIONS = Object.freeze({
  resizeWidth: NATIVE_WIDTH,
  resizeHeight: NATIVE_HEIGHT,
  resizeQuality: 'pixelated'
});

export class StreamingGpuRendererService extends BaseService {
  static readonly dependencies = [
    'eventBus',
    'loggerFactory',
    'settingsService',
    'gpuFrameBuffer',
    'gpuWorkerManager'
  ] as const;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher for render events
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {SettingsService} dependencies.settingsService - Settings for brightness/preset
   * @param {GpuFrameBuffer} dependencies.gpuFrameBuffer - Frame buffer manager
   * @param {GpuWorkerManager} dependencies.gpuWorkerManager - Worker lifecycle manager
   */
  constructor(dependencies) {
    super(
      dependencies,
      [...StreamingGpuRendererService.dependencies],
      'StreamingGpuRendererService'
    );

    this._frameBuffer = dependencies.gpuFrameBuffer;
    this._workerManager = dependencies.gpuWorkerManager;

    this._pendingFrames = 0;

    this._capabilities = null;

    this._currentPresetId = null;
    this._currentPreset = null;
    this._scaleFactor = 1;
    this._targetWidth = NATIVE_WIDTH;
    this._targetHeight = NATIVE_HEIGHT;

    this._uniformContext = null;

    this._lastStats = null;

    this._isUsingFallback = false;

    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
    this._captureTimeoutId = null;
    this._isWaitingForCapturedFrame = false;

    this._brightnessUnsubscribe = null;

    this._isDestroying = false;

    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;

    this._messageUnsubscribers = [];

    this._rvfcHandle = null;
    this._renderLoopActive = false;
  }

  /**
   * Initialize the GPU renderer with a canvas element
   * Detects GPU capabilities, delegates worker creation to GpuWorkerManager,
   * and sets up the rendering pipeline.
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to (control will be transferred)
   * @param {Object} [nativeResolution={width: 160, height: 144}] - Native device resolution
   * @returns {Promise<boolean>} True if GPU rendering is available, false if fallback needed
   */
  async initialize(canvasElement, nativeResolution = { width: NATIVE_WIDTH, height: NATIVE_HEIGHT }) {
    this.logger.info('Initializing GPU renderer...');

    if (!this._brightnessUnsubscribe) {
      this._brightnessUnsubscribe = this.eventBus.subscribe(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        (brightness) => {
          if (this._uniformContext) {
            this._uniformContext.setBrightness(brightness);
          }
          this.logger.debug(`Global brightness updated to ${brightness.toFixed(2)}`);
        }
      );
    }

    this._capabilities = await CapabilityDetector.detect();
    this.logger.info(CapabilityDetector.describeCapabilities(this._capabilities));

    this.eventBus.publish(EventChannels.RENDER.CAPABILITY_DETECTED, this._capabilities);

    if (!CapabilityDetector.isGPURenderingAvailable(this._capabilities)) {
      this.logger.warn('GPU rendering not available, will use Canvas2D fallback');
      this._isUsingFallback = true;
      return false;
    }

    if (!CapabilityDetector.isWorkerRenderingAvailable(this._capabilities)) {
      this.logger.warn(
        'Worker rendering not available; main-thread GPU mode is unsupported, using Canvas2D fallback'
      );
      this._isUsingFallback = true;
      return false;
    }

    try {
      this._scaleFactor = Math.max(1, Math.floor(Math.min(
        canvasElement.clientWidth / nativeResolution.width,
        canvasElement.clientHeight / nativeResolution.height
      )));
      this._targetWidth = nativeResolution.width * this._scaleFactor;
      this._targetHeight = nativeResolution.height * this._scaleFactor;

      const savedPresetId = this.settingsService.getRenderPreset?.() || PresetRegistry.getDefault().id;
      this._currentPresetId = savedPresetId;
      this._currentPreset = PresetRegistry.get(savedPresetId) || PresetRegistry.getDefault();

      this._uniformContext = new UniformContext({
        preset: this._currentPreset,
        nativeWidth: nativeResolution.width,
        nativeHeight: nativeResolution.height,
        outputWidth: this._targetWidth,
        outputHeight: this._targetHeight,
        brightness: this.settingsService.getGlobalBrightness()
      });

      const config = {
        nativeWidth: nativeResolution.width,
        nativeHeight: nativeResolution.height,
        targetWidth: this._targetWidth,
        targetHeight: this._targetHeight,
        scaleFactor: this._scaleFactor,
        api: this._capabilities.preferredAPI,
        presetId: this._currentPresetId
      };

      this._registerMessageHandlers();

      const initialized = await this._workerManager.initialize(canvasElement, config, 5000);

      if (!initialized) {
        this.logger.error('Worker manager initialization returned false');
        this._unregisterMessageHandlers();
        this._isUsingFallback = true;
        return false;
      }

      this.logger.info(`GPU renderer initialized with ${this._capabilities.preferredAPI}`);
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize GPU renderer:', error);
      this._cleanup();
      this._isUsingFallback = true;
      return false;
    }
  }

  /**
   * Register domain-specific message handlers on the worker manager
   * @private
   */
  _registerMessageHandlers() {
    this._unregisterMessageHandlers();

    this._messageUnsubscribers = [
      this._workerManager.onMessage(WorkerResponseType.READY, (payload) => {
        this.logger.info(`Render worker ready (API: ${payload.api})`);
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, payload);
      }),

      this._workerManager.onMessage(WorkerResponseType.FRAME_RENDERED, () => {
        this._pendingFrames = Math.max(0, this._pendingFrames - 1);
        if (this._isWaitingForCapturedFrame) {
          this._isWaitingForCapturedFrame = false;
          this._workerManager.sendCommand(WorkerMessageType.CAPTURE);
        }
      }),

      this._workerManager.onMessage(WorkerResponseType.STATS, (payload) => {
        this._lastStats = payload;
        this.eventBus.publish(EventChannels.RENDER.STATS_UPDATE, payload);
      }),

      this._workerManager.onMessage(WorkerResponseType.ERROR, (payload) => {
        if (payload.code === 'DEVICE_LOST' && payload.message?.includes('destroyed')) {
          this.logger.debug('GPU device destroyed (expected during cleanup)');
          return;
        }
        this.logger.error('Render worker error:', payload.message);
        this._pendingFrames = 0;
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, payload);
        this._clearCaptureTimeout();
        this._resolvePendingCapture(null, new Error(payload.message));
      }),

      this._workerManager.onMessage(WorkerResponseType.CAPTURE_REQUESTED, () => {}),

      this._workerManager.onMessage(WorkerResponseType.CAPTURE_READY, (payload) => {
        this._clearCaptureTimeout();
        this._resolvePendingCapture(payload.bitmap, null);
      }),

      this._workerManager.onMessage(WorkerResponseType.RELEASED, () => {
        this.logger.info('GPU resources released (worker still alive)');
      }),

      this._workerManager.onMessage(WorkerResponseType.DESTROYED, () => {
        this.logger.info('Render worker destroyed');
      })
    ];
  }

  /**
   * Unregister all domain-specific message handlers
   * @private
   */
  _unregisterMessageHandlers() {
    for (const unsub of this._messageUnsubscribers) {
      unsub();
    }
    this._messageUnsubscribers = [];
  }

  /**
   * Render a video frame through the GPU pipeline
   * Applies shader effects based on current preset and brightness settings.
   * Implements triple buffering to prevent frame drops.
   * @param {HTMLVideoElement} videoElement - Video element to capture frame from
   * @returns {Promise<void>}
   */
  async renderFrame(videoElement) {
    if (!this._workerManager.isReady() || this._pendingFrames >= MAX_PENDING_FRAMES) {
      if (this._workerManager.isReady() && this._pendingFrames >= MAX_PENDING_FRAMES) {
        this._handleBackpressure();
      }
      return;
    }

    if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) {
      return;
    }

    let imageBitmap = null;

    try {
      imageBitmap = await createImageBitmap(videoElement, BITMAP_OPTIONS);

      const uniforms = this._getCachedUniforms();

      this._pendingFrames++;

      this._workerManager.sendCommand(
        WorkerMessageType.FRAME,
        { imageBitmap, uniforms },
        [imageBitmap]
      );
      imageBitmap = null;
    } catch (error) {
      this.logger.error('Failed to render frame:', error);
      if (imageBitmap) {
        imageBitmap.close();
      }
    }
  }

  /**
   * Get uniforms for the current frame via UniformContext dirty-flag cache
   * @returns {Object} Uniform values for all shader passes
   * @private
   */
  _getCachedUniforms() {
    return this._uniformContext.uniforms;
  }

  /**
   * Set the active render preset (shader configuration)
   * @param {string} presetId - Preset ID (e.g., 'authentic', 'vivid', 'sharp')
   */
  setPreset(presetId) {
    const preset = PresetRegistry.get(presetId);
    if (!preset) {
      this.logger.warn(`Unknown preset: ${presetId}`);
      return;
    }

    if (this._currentPresetId === presetId) {
      return;
    }

    this._currentPresetId = presetId;
    this._currentPreset = preset;

    if (this._uniformContext) {
      this._uniformContext.setPreset(preset);
    }

    this.logger.info(`Render preset changed to: ${preset.name}`);

    if (this._workerManager.isReady()) {
      this._workerManager.sendCommand(WorkerMessageType.SET_PRESET, {
        presetId,
        preset
      });
    }
  }

  /**
   * Get current preset ID
   * @returns {string|null} Current preset ID, or null if not initialized
   */
  getPresetId() {
    return this._currentPresetId;
  }

  /**
   * Resize the render target to new dimensions
   * Recalculates scale factor and updates worker textures.
   * @param {number} width - New width in CSS pixels
   * @param {number} height - New height in CSS pixels
   */
  resize(width, height) {
    this._scaleFactor = Math.max(1, Math.floor(Math.min(
      width / NATIVE_WIDTH,
      height / NATIVE_HEIGHT
    )));

    this._targetWidth = NATIVE_WIDTH * this._scaleFactor;
    this._targetHeight = NATIVE_HEIGHT * this._scaleFactor;

    if (this._uniformContext) {
      this._uniformContext.setOutputSize(this._targetWidth, this._targetHeight);
    }

    if (this._workerManager.isReady()) {
      this._workerManager.sendCommand(WorkerMessageType.RESIZE, {
        width: this._targetWidth,
        height: this._targetHeight,
        scaleFactor: this._scaleFactor
      });
    }

    this.logger.debug(`Resized to ${this._targetWidth}×${this._targetHeight} (${this._scaleFactor}× scale)`);
  }

  /**
   * Check if GPU rendering is active
   * @returns {boolean} True if ready and not using fallback
   */
  isActive() {
    return this._workerManager.isReady() && !this._isUsingFallback;
  }

  /**
   * Check if using fallback renderer (Canvas2D)
   * @returns {boolean} True if GPU unavailable and using fallback
   */
  isFallback() {
    return this._isUsingFallback;
  }

  /**
   * Check if canvas control was transferred to offscreen
   * If true, Canvas2D fallback cannot use this canvas.
   * @returns {boolean} True if canvas was transferred (irreversible)
   */
  isCanvasTransferred() {
    return this._workerManager.isCanvasTransferred();
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null} GPU capabilities or null if not detected
   */
  getCapabilities() {
    return this._capabilities;
  }

  /**
   * Get current target rendering dimensions
   * @returns {{width: number, height: number}} Target dimensions for rendered output
   */
  getTargetDimensions() {
    return {
      width: this._targetWidth,
      height: this._targetHeight
    };
  }

  /**
   * Capture the current rendered frame with shader effects applied
   * Uses request-before-capture pattern: arms lazy capture, waits for next frame,
   * then retrieves the captured frame with all shader effects at upscaled resolution.
   * @returns {Promise<ImageBitmap>} The captured frame as ImageBitmap
   * @throws {Error} If renderer not ready or capture already in progress
   */
  async captureFrame() {
    if (this._isDestroying) {
      throw new Error('GPU renderer is shutting down');
    }

    if (!this._workerManager.isReady()) {
      throw new Error('GPU renderer not ready');
    }

    if (this._pendingCaptureResolve) {
      throw new Error('Capture already in progress');
    }

    return new Promise((resolve, reject) => {
      this._pendingCaptureResolve = resolve;
      this._pendingCaptureReject = reject;

      this._workerManager.sendCommand(WorkerMessageType.REQUEST_CAPTURE);

      this._isWaitingForCapturedFrame = true;

      this._captureTimeoutId = setTimeout(() => {
        this._isWaitingForCapturedFrame = false;
        this._resolvePendingCapture(null, new Error('Capture request timed out'));
      }, 1000);
    });
  }

  /**
   * Release GPU resources while keeping worker alive
   * Allows re-initialization without needing a new canvas transfer.
   * Used for idle memory savings when streaming stops.
   */
  releaseGpuResources() {
    if (!this._workerManager.isReady()) {
      this.logger.debug('releaseGpuResources: Nothing to release (worker not ready)');
      return;
    }

    this._workerManager.releaseResources();
    this._pendingFrames = 0;
    this._resetBackpressureTracking();

    this.logger.info('GPU resources released (worker kept alive for re-init)');
  }

  /**
   * Fully terminate worker and reset canvas state
   * Forces Chromium GPU process to release cached resources.
   * Emits CANVAS_EXPIRED event so UI can provide fresh canvas on next init.
   */
  terminateAndReset(emitCanvasExpired = true) {
    if (!this._workerManager.isCanvasTransferred()) {
      this.logger.debug('terminateAndReset: Nothing to terminate');
      return;
    }

    this._cleanup(false);

    if (emitCanvasExpired) {
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('GPU renderer terminated - canvas expired, will need fresh canvas');
    } else {
      this.logger.info('GPU renderer terminated - caller will handle canvas refresh');
    }
  }

  /**
   * Resolve or reject a pending capture request and clean up state
   * @param {ImageBitmap|null} result - The captured frame (null if error)
   * @param {Error|null} error - The error (null if success)
   * @private
   */
  _resolvePendingCapture(result, error) {
    this._clearCaptureTimeout();

    if (error && this._pendingCaptureReject) {
      this._pendingCaptureReject(error);
    } else if (result && this._pendingCaptureResolve) {
      this._pendingCaptureResolve(result);
    }

    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
  }

  /**
   * Clear capture timeout if active
   * @private
   */
  _clearCaptureTimeout() {
    if (this._captureTimeoutId !== null) {
      clearTimeout(this._captureTimeoutId);
      this._captureTimeoutId = null;
    }
  }

  /**
   * Reset backpressure tracking state
   * @private
   */
  _resetBackpressureTracking() {
    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;
  }

  /**
   * Handle backpressure by tracking skipped frames and logging periodically
   * @private
   */
  _handleBackpressure() {
    this._skippedFrames++;
    const now = performance.now();
    if (now - this._lastBackpressureLog > 5000) {
      this.logger.warn(`GPU backpressure: ${this._skippedFrames} frame(s) skipped (pending: ${this._pendingFrames})`);
      this._skippedFrames = 0;
      this._lastBackpressureLog = now;
    }
  }

  /**
   * Start requestVideoFrameCallback render loop
   * @param {Object} config - Render loop configuration
   * @param {HTMLVideoElement} config.videoElement - Video element for frame callback
   * @param {Function} config.renderFrame - Frame rendering function
   * @param {Function} config.shouldContinue - Function returning true if loop should continue
   */
  startRenderLoop({ videoElement, renderFrame, shouldContinue }) {
    if (!videoElement?.requestVideoFrameCallback) {
      this.logger.warn('requestVideoFrameCallback not available');
      return;
    }

    this._renderLoopActive = true;
    let lastFrameTime = -1;

    const renderLoop = (now, metadata) => {
      if (!this._renderLoopActive) return;

      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        renderFrame();
        lastFrameTime = frameTime;
      }

      if (shouldContinue()) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderLoop);
      }
    };

    this._rvfcHandle = videoElement.requestVideoFrameCallback(renderLoop);
  }

  /**
   * Stop requestVideoFrameCallback render loop
   * @param {HTMLVideoElement} videoElement - Video element for callback cancellation
   */
  stopRenderLoop(videoElement) {
    this._renderLoopActive = false;

    if (this._rvfcHandle !== null) {
      if (videoElement?.cancelVideoFrameCallback) {
        videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      }
      this._rvfcHandle = null;
    }
  }

  /**
   * Cleanup resources by delegating to worker manager
   * @param {boolean} [emitCanvasExpired=true] - Whether to emit CANVAS_EXPIRED
   */
  _cleanup(emitCanvasExpired = true) {
    this._isDestroying = true;

    if (this._brightnessUnsubscribe) {
      this._brightnessUnsubscribe();
      this._brightnessUnsubscribe = null;
    }

    this._resolvePendingCapture(null, new Error('GPU renderer cleanup'));

    this._unregisterMessageHandlers();

    const wasTransferred = this._workerManager.isCanvasTransferred();

    this._workerManager.terminate();

    this._pendingFrames = 0;
    this._resetBackpressureTracking();

    if (emitCanvasExpired && wasTransferred) {
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('Canvas expired - orchestrator will recreate for next session');
    }

    this._isDestroying = false;
  }

  /**
   * Cleanup on service disposal
   * Terminates worker and releases all resources.
   */
  cleanup() {
    this._cleanup();
    this.logger.info('GPU renderer service cleaned up');
  }
}
