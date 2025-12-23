/**
 * GPU Renderer Service
 *
 * Main thread service that coordinates GPU-accelerated rendering.
 * Manages the render worker, handles frame submission, and provides
 * fallback to Canvas2D when GPU rendering is unavailable.
 *
 * Features:
 * - Automatic capability detection
 * - Worker-based rendering with OffscreenCanvas
 * - Triple buffering to prevent frame drops
 * - Seamless preset switching
 * - Graceful fallback chain
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';
import { CapabilityDetector } from './capability.detector.js';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage
} from '../workers/worker.protocol.js';
import {
  DEFAULT_PRESET_ID,
  getPresetById,
  buildUniformsFromPreset
} from '../presets/render.presets.js';

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

export class GPURendererService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher for render events
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {SettingsService} dependencies.settingsService - Settings for brightness/preset
   */
  constructor(dependencies) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory', 'settingsService'],
      'GPURendererService'
    );

    // Worker state
    this._worker = null;
    this._isReady = false;
    this._pendingFrames = 0;

    // Canvas references
    this._canvas = null;
    this._offscreenCanvas = null;

    // GPU capabilities
    this._capabilities = null;

    // Current configuration
    this._currentPresetId = null;
    this._currentPreset = null;
    this._globalBrightness = 1.0;
    this._scaleFactor = 1;
    this._targetWidth = NATIVE_WIDTH;
    this._targetHeight = NATIVE_HEIGHT;

    // Performance stats
    this._lastStats = null;

    // Fallback flag
    this._usingFallback = false;

    // Track if canvas control was transferred (irreversible operation)
    this._canvasTransferred = false;

    // Pending capture request (Promise resolvers and timeout)
    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
    this._captureTimeoutId = null;
    this._waitingForCapturedFrame = false;

    // Brightness event subscription (for cleanup)
    this._brightnessUnsubscribe = null;

    // Ready promise resolvers (for direct resolution instead of polling)
    this._readyResolve = null;
    this._readyReject = null;
    this._readyTimeoutId = null;

    // Backpressure diagnostics (throttled logging to avoid spam)
    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;
  }

  /**
   * Initialize the GPU renderer with a canvas element
   * Detects GPU capabilities, creates render worker, and sets up the rendering pipeline.
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to (control will be transferred)
   * @param {Object} [nativeResolution={width: 160, height: 144}] - Native device resolution
   * @returns {Promise<boolean>} True if GPU rendering is available, false if fallback needed
   */
  async initialize(canvasElement, nativeResolution = { width: NATIVE_WIDTH, height: NATIVE_HEIGHT }) {
    this.logger.info('Initializing GPU renderer...');

    // Load initial brightness from settings and subscribe to changes
    this._globalBrightness = this.settingsService.getGlobalBrightness();
    if (!this._brightnessUnsubscribe) {
      this._brightnessUnsubscribe = this.eventBus.subscribe(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        (brightness) => {
          this._globalBrightness = brightness;
          this.logger.debug(`Global brightness updated to ${brightness.toFixed(2)}`);
        }
      );
    }

    // Detect GPU capabilities
    this._capabilities = await CapabilityDetector.detect();
    this.logger.info(CapabilityDetector.describeCapabilities(this._capabilities));

    // Publish capability detection event
    this.eventBus.publish(EventChannels.RENDER.CAPABILITY_DETECTED, this._capabilities);

    // Check if GPU rendering is possible
    if (!CapabilityDetector.isGPURenderingAvailable(this._capabilities)) {
      this.logger.warn('GPU rendering not available, will use Canvas2D fallback');
      this._usingFallback = true;
      return false;
    }

    // Check if worker rendering is possible
    if (!CapabilityDetector.isWorkerRenderingAvailable(this._capabilities)) {
      this.logger.warn('Worker rendering not available, will use main-thread GPU rendering');
      // TODO: Implement main-thread GPU rendering
      this._usingFallback = true;
      return false;
    }

    try {
      // Check if this is the same canvas that was already transferred
      if (this._canvas === canvasElement && this._canvasTransferred) {
        // Canvas was already transferred
        if (this._worker) {
          // Worker exists - check if we can reuse or need to re-init
          if (this._isReady) {
            // Already initialized - just resize
            this.logger.info('Reusing existing GPU renderer setup (canvas already transferred)');

            this._scaleFactor = Math.max(1, Math.floor(Math.min(
              canvasElement.clientWidth / nativeResolution.width,
              canvasElement.clientHeight / nativeResolution.height
            )));
            this._targetWidth = nativeResolution.width * this._scaleFactor;
            this._targetHeight = nativeResolution.height * this._scaleFactor;

            this.resize(canvasElement.clientWidth, canvasElement.clientHeight);
            return true;
          } else {
            // Worker alive but GPU released - re-initialize GPU resources
            this.logger.info('Re-initializing GPU resources (worker alive, resources were released)');

            this._scaleFactor = Math.max(1, Math.floor(Math.min(
              canvasElement.clientWidth / nativeResolution.width,
              canvasElement.clientHeight / nativeResolution.height
            )));
            this._targetWidth = nativeResolution.width * this._scaleFactor;
            this._targetHeight = nativeResolution.height * this._scaleFactor;

            // Load saved preset or use default
            const savedPresetId = this.settingsService.getRenderPreset?.() || DEFAULT_PRESET_ID;
            this._currentPresetId = savedPresetId;
            this._currentPreset = getPresetById(savedPresetId) || getPresetById(DEFAULT_PRESET_ID);

            // Build config for re-init (no canvas - worker already has it)
            const config = {
              nativeWidth: nativeResolution.width,
              nativeHeight: nativeResolution.height,
              targetWidth: this._targetWidth,
              targetHeight: this._targetHeight,
              scaleFactor: this._scaleFactor,
              api: this._capabilities.preferredAPI,
              presetId: this._currentPresetId
            };

            // Send init message WITHOUT canvas (worker reuses stored reference)
            const message = createWorkerMessage(WorkerMessageType.INIT, { config });
            this._worker.postMessage(message);

            await this._waitForReady(5000);
            this.logger.info('GPU resources re-initialized successfully');
            return true;
          }
        } else {
          // Canvas was transferred but worker is gone - we can't recover
          this.logger.error('Canvas control was previously transferred but worker terminated. Cannot reinitialize.');
          this._usingFallback = true;
          return false;
        }
      }

      // Store canvas reference
      this._canvas = canvasElement;

      // Transfer canvas control to offscreen
      // WARNING: This is irreversible - canvas can never be used with 2D context after this
      this._offscreenCanvas = canvasElement.transferControlToOffscreen();
      this._canvasTransferred = true;

      // Create the render worker
      this._worker = new Worker(
        new URL('../workers/render.worker.js', import.meta.url),
        { type: 'module' }
      );

      // Set up message handler
      this._worker.onmessage = (event) => this._handleWorkerMessage(event);
      this._worker.onerror = (error) => this._handleWorkerError(error);

      // Calculate initial dimensions
      this._scaleFactor = Math.max(1, Math.floor(Math.min(
        canvasElement.clientWidth / nativeResolution.width,
        canvasElement.clientHeight / nativeResolution.height
      )));
      this._targetWidth = nativeResolution.width * this._scaleFactor;
      this._targetHeight = nativeResolution.height * this._scaleFactor;

      // Load saved preset or use default
      const savedPresetId = this.settingsService.getRenderPreset?.() || DEFAULT_PRESET_ID;
      this._currentPresetId = savedPresetId;
      this._currentPreset = getPresetById(savedPresetId) || getPresetById(DEFAULT_PRESET_ID);

      // Build initialization config
      const config = {
        nativeWidth: nativeResolution.width,
        nativeHeight: nativeResolution.height,
        targetWidth: this._targetWidth,
        targetHeight: this._targetHeight,
        scaleFactor: this._scaleFactor,
        api: this._capabilities.preferredAPI,
        presetId: this._currentPresetId
      };

      // Send init message to worker
      const message = createWorkerMessage(WorkerMessageType.INIT, {
        canvas: this._offscreenCanvas,
        config
      });

      this._worker.postMessage(message, [this._offscreenCanvas]);

      // Wait for worker to be ready (with timeout)
      await this._waitForReady(5000);

      this.logger.info(`GPU renderer initialized with ${this._capabilities.preferredAPI}`);
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize GPU renderer:', error);
      this._cleanup();
      this._usingFallback = true;
      return false;
    }
  }

  /**
   * Wait for the worker to report ready
   * Uses direct promise resolution instead of polling for immediate response
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<void>}
   */
  _waitForReady(timeout) {
    // If already ready, resolve immediately
    if (this._isReady) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;

      this._readyTimeoutId = setTimeout(() => {
        this._readyResolve = null;
        this._readyReject = null;
        this._readyTimeoutId = null;
        reject(new Error('Worker initialization timed out'));
      }, timeout);
    });
  }

  /**
   * Resolve the pending ready promise
   * Called by _handleWorkerMessage when READY is received
   * @private
   */
  _resolveReady() {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }

    if (this._readyResolve) {
      this._readyResolve();
      this._readyResolve = null;
      this._readyReject = null;
    }
  }

  /**
   * Handle messages from the render worker
   * @param {MessageEvent} event
   */
  _handleWorkerMessage(event) {
    const { type, payload } = event.data;

    switch (type) {
      case WorkerResponseType.READY:
        this._isReady = true;
        this._resolveReady();
        this.logger.info(`Render worker ready (API: ${payload.api})`);
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, payload);
        break;

      case WorkerResponseType.FRAME_RENDERED:
        this._pendingFrames = Math.max(0, this._pendingFrames - 1);
        // If we're waiting for a frame to be captured, send CAPTURE now
        if (this._waitingForCapturedFrame) {
          this._waitingForCapturedFrame = false;
          const captureMessage = createWorkerMessage(WorkerMessageType.CAPTURE);
          this._worker.postMessage(captureMessage);
        }
        break;

      case WorkerResponseType.STATS:
        this._lastStats = payload;
        this.eventBus.publish(EventChannels.RENDER.STATS_UPDATE, payload);
        break;

      case WorkerResponseType.ERROR:
        // Ignore expected "destroyed" errors from intentional resource release
        if (payload.code === 'DEVICE_LOST' && payload.message?.includes('destroyed')) {
          this.logger.debug('GPU device destroyed (expected during cleanup)');
          break;
        }
        this.logger.error('Render worker error:', payload.message);
        this._isReady = false;
        this._pendingFrames = 0;
        if (this._readyReject) {
          const readyReject = this._readyReject;
          this._readyResolve = null;
          this._readyReject = null;
          if (this._readyTimeoutId !== null) {
            clearTimeout(this._readyTimeoutId);
            this._readyTimeoutId = null;
          }
          readyReject(new Error(payload.message));
        }
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, payload);
        if (this._captureTimeoutId) {
          clearTimeout(this._captureTimeoutId);
          this._captureTimeoutId = null;
        }
        this._resolvePendingCapture(null, new Error(payload.message));
        break;

      case WorkerResponseType.CAPTURE_REQUESTED:
        // Capture request acknowledged - no logging needed (floods console during recording)
        break;

      case WorkerResponseType.CAPTURE_READY:
        // Clear timeout to prevent race condition
        if (this._captureTimeoutId) {
          clearTimeout(this._captureTimeoutId);
          this._captureTimeoutId = null;
        }
        // Resolve pending capture request with the ImageBitmap
        this._resolvePendingCapture(payload.bitmap, null);
        break;

      case WorkerResponseType.RELEASED:
        this.logger.info('GPU resources released (worker still alive)');
        break;

      case WorkerResponseType.DESTROYED:
        this.logger.info('Render worker destroyed');
        break;
    }
  }

  /**
   * Handle worker errors
   * @param {ErrorEvent} error
   */
  _handleWorkerError(error) {
    this.logger.error('Worker error:', error.message);
    this._isReady = false;
    this._pendingFrames = 0;

    // Reject pending ready promise if waiting for initialization
    if (this._readyReject) {
      this._readyReject(new Error(error.message));
      this._readyResolve = null;
      this._readyReject = null;
      if (this._readyTimeoutId !== null) {
        clearTimeout(this._readyTimeoutId);
        this._readyTimeoutId = null;
      }
    }

    this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, {
      message: error.message,
      code: 'WORKER_ERROR'
    });
  }

  /**
   * Render a video frame through the GPU pipeline
   * Applies shader effects based on current preset and brightness settings.
   * Implements triple buffering to prevent frame drops.
   * @param {HTMLVideoElement} videoElement - Video element to capture frame from
   * @returns {Promise<void>}
   */
  async renderFrame(videoElement) {
    // Skip if not ready or too many pending frames (triple buffering)
    if (!this._isReady || this._pendingFrames >= MAX_PENDING_FRAMES) {
      // Track backpressure for diagnostics
      if (this._isReady && this._pendingFrames >= MAX_PENDING_FRAMES) {
        this._skippedFrames++;
        const now = performance.now();
        // Log every 5 seconds if frames are being skipped
        if (now - this._lastBackpressureLog > 5000) {
          this.logger.warn(`GPU backpressure: ${this._skippedFrames} frame(s) skipped (pending: ${this._pendingFrames})`);
          this._skippedFrames = 0;
          this._lastBackpressureLog = now;
        }
      }
      return;
    }

    // Skip if video not ready
    if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) {
      return;
    }

    let imageBitmap = null;

    try {
      // Create ImageBitmap from video for efficient transfer
      imageBitmap = await createImageBitmap(videoElement, {
        resizeWidth: NATIVE_WIDTH,
        resizeHeight: NATIVE_HEIGHT,
        resizeQuality: 'pixelated'
      });

      // Build uniforms from current preset
      const uniforms = buildUniformsFromPreset(
        this._currentPreset,
        this._scaleFactor,
        this._targetWidth,
        this._targetHeight
      );

      // Apply global brightness multiplier
      uniforms.color.brightness *= this._globalBrightness;

      // Send frame to worker
      this._pendingFrames++;

      const message = createWorkerMessage(WorkerMessageType.FRAME, {
        imageBitmap,
        uniforms
      });

      this._worker.postMessage(message, [imageBitmap]);
      imageBitmap = null; // Ownership transferred
    } catch (error) {
      this.logger.error('Failed to render frame:', error);
      if (imageBitmap) {
        imageBitmap.close();
      }
    }
  }

  /**
   * Set the active render preset (shader configuration)
   * @param {string} presetId - Preset ID (e.g., 'authentic', 'vivid', 'sharp')
   */
  setPreset(presetId) {
    const preset = getPresetById(presetId);
    if (!preset) {
      this.logger.warn(`Unknown preset: ${presetId}`);
      return;
    }

    // Skip if already set to this preset
    if (this._currentPresetId === presetId) {
      return;
    }

    this._currentPresetId = presetId;
    this._currentPreset = preset;

    this.logger.info(`Render preset changed to: ${preset.name}`);

    // Notify worker (for any preset-specific resource changes)
    if (this._worker && this._isReady) {
      const message = createWorkerMessage(WorkerMessageType.SET_PRESET, {
        presetId,
        preset
      });
      this._worker.postMessage(message);
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
    // Calculate new integer scale factor
    this._scaleFactor = Math.max(1, Math.floor(Math.min(
      width / NATIVE_WIDTH,
      height / NATIVE_HEIGHT
    )));

    this._targetWidth = NATIVE_WIDTH * this._scaleFactor;
    this._targetHeight = NATIVE_HEIGHT * this._scaleFactor;

    // Notify worker
    if (this._worker && this._isReady) {
      const message = createWorkerMessage(WorkerMessageType.RESIZE, {
        width: this._targetWidth,
        height: this._targetHeight,
        scaleFactor: this._scaleFactor
      });
      this._worker.postMessage(message);
    }

    this.logger.debug(`Resized to ${this._targetWidth}×${this._targetHeight} (${this._scaleFactor}× scale)`);
  }

  /**
   * Check if GPU rendering is active
   * @returns {boolean} True if ready and not using fallback
   */
  isActive() {
    return this._isReady && !this._usingFallback;
  }

  /**
   * Check if using fallback renderer (Canvas2D)
   * @returns {boolean} True if GPU unavailable and using fallback
   */
  isFallback() {
    return this._usingFallback;
  }

  /**
   * Check if canvas control was transferred to offscreen
   * If true, Canvas2D fallback cannot use this canvas.
   * @returns {boolean} True if canvas was transferred (irreversible)
   */
  isCanvasTransferred() {
    return this._canvasTransferred;
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null} GPU capabilities or null if not detected
   */
  getCapabilities() {
    return this._capabilities;
  }

  /**
   * Get last performance statistics from worker
   * @returns {Object|null} Stats with fps and frameTime, or null
   */
  getStats() {
    return this._lastStats;
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
    if (!this._isReady || !this._worker) {
      throw new Error('GPU renderer not ready');
    }

    // Only allow one pending capture at a time
    if (this._pendingCaptureResolve) {
      throw new Error('Capture already in progress');
    }

    return new Promise((resolve, reject) => {
      this._pendingCaptureResolve = resolve;
      this._pendingCaptureReject = reject;

      // Step 1: Send REQUEST_CAPTURE to arm the lazy capture buffer
      const requestMessage = createWorkerMessage(WorkerMessageType.REQUEST_CAPTURE);
      this._worker.postMessage(requestMessage);

      // Step 2: Set flag to send CAPTURE when next FRAME_RENDERED arrives
      // This ensures we capture a fully rendered frame with all shader effects
      this._waitingForCapturedFrame = true;

      // Timeout after 1 second (should complete within 1-2 frames at 60fps)
      this._captureTimeoutId = setTimeout(() => {
        this._waitingForCapturedFrame = false;
        this._resolvePendingCapture(null, new Error('Capture request timed out'));
      }, 1000);
    });
  }

  /**
   * Release GPU resources while keeping worker alive
   * Allows re-initialization without needing a new canvas transfer.
   * Used for idle memory savings when streaming stops.
   */
  releaseResources() {
    if (!this._worker || !this._isReady) {
      this.logger.debug('releaseResources: Nothing to release (worker not ready)');
      return;
    }

    // Send release message to worker (keeps worker alive)
    this._worker.postMessage(createWorkerMessage(WorkerMessageType.RELEASE));
    this._isReady = false;
    this._pendingFrames = 0;

    // Reset backpressure diagnostics to avoid stale counts on re-init
    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;

    // Note: Worker stays alive, canvas reference preserved
    // This allows re-initialization without canvas transfer
    this.logger.info('GPU resources released (worker kept alive for re-init)');
  }

  /**
   * Fully terminate worker and reset canvas state
   * Forces Chromium GPU process to release cached resources.
   * Emits CANVAS_EXPIRED event so UI can provide fresh canvas on next init.
   */
  terminateAndReset(emitCanvasExpired = true) {
    if (!this._worker && !this._canvasTransferred) {
      this.logger.debug('terminateAndReset: Nothing to terminate');
      return;
    }

    // Pass false to avoid duplicate CANVAS_EXPIRED emission - we handle it explicitly below
    this._cleanup(false);
    this._canvasTransferred = false;

    if (emitCanvasExpired) {
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('GPU renderer terminated - canvas expired, will need fresh canvas');
    } else {
      this.logger.info('GPU renderer terminated - caller will handle canvas refresh');
    }
  }

  /**
   * Resolve or reject a pending capture request and clean up state
   * Centralizes cleanup logic to ensure timeout is always cleared
   * @param {ImageBitmap|null} result - The captured frame (null if error)
   * @param {Error|null} error - The error (null if success)
   * @private
   */
  _resolvePendingCapture(result, error) {
    // Clear timeout first to prevent race conditions
    if (this._captureTimeoutId !== null) {
      clearTimeout(this._captureTimeoutId);
      this._captureTimeoutId = null;
    }

    // Resolve or reject if pending
    if (error && this._pendingCaptureReject) {
      this._pendingCaptureReject(error);
    } else if (result && this._pendingCaptureResolve) {
      this._pendingCaptureResolve(result);
    }

    // Clear pending state
    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
  }

  /**
   * Cleanup resources
   * @param {boolean} [emitCanvasExpired=true] - Whether to emit CANVAS_EXPIRED if canvas was transferred
   */
  _cleanup(emitCanvasExpired = true) {
    // Unsubscribe from brightness events
    if (this._brightnessUnsubscribe) {
      this._brightnessUnsubscribe();
      this._brightnessUnsubscribe = null;
    }

    // Reject any pending capture request before destroying worker
    this._resolvePendingCapture(null, new Error('GPU renderer cleanup'));

    if (this._worker) {
      this._worker.postMessage(createWorkerMessage(WorkerMessageType.DESTROY));
      this._worker.terminate();
      this._worker = null;
    }

    this._isReady = false;
    this._pendingFrames = 0;
    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;
    this._canvas = null;
    this._offscreenCanvas = null;

    // If canvas was transferred but cleanup is happening (init failure, error, etc.),
    // emit CANVAS_EXPIRED so orchestrator can provide fresh canvas on next init
    if (emitCanvasExpired && this._canvasTransferred) {
      this._canvasTransferred = false;
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('Canvas expired - orchestrator will recreate for next session');
    }
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
