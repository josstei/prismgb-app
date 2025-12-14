/**
 * Streaming Orchestrator
 *
 * Coordinates media stream lifecycle and rendering
 * Thin coordinator - delegates to StreamingService and specialized managers
 *
 * Responsibilities:
 * - Coordinate stream start/stop
 * - Delegate to specialized managers (CanvasRenderer, ViewportManager, VisibilityHandler)
 * - Handle stream events
 * - Coordinate device selection changes
 *
 * Performance optimizations:
 * - Delegated to CanvasRenderer: RAF/RVFC management, frame skipping, context caching
 * - Delegated to ViewportManager: Cached resolution calculations, debounced resize
 * - Delegated to VisibilityHandler: Visibility-based rendering pause/resume
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

export class StreamingOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(
      dependencies,
      ['streamingService', 'appState', 'uiController', 'canvasRenderer', 'viewportManager', 'visibilityHandler', 'streamHealthMonitor', 'gpuRendererService', 'eventBus', 'loggerFactory'],
      'StreamingOrchestrator'
    );

    // Store current capabilities for visibility resume
    this._currentCapabilities = null;

    // Use injected specialized managers
    this._canvasRenderer = dependencies.canvasRenderer;
    this._viewportManager = dependencies.viewportManager;
    this._visibilityHandler = dependencies.visibilityHandler;
    this._streamHealthMonitor = dependencies.streamHealthMonitor;
    this._gpuRendererService = dependencies.gpuRendererService;

    // Track if GPU rendering is active
    this._useGPURenderer = false;
    this._gpuRenderLoopActive = false;
    this._rvfcHandle = null;

    // GPU idle termination timer (forces GPU cache flush when not streaming)
    this._idleReleaseTimeout = null;
    this._idleReleaseDelay = 30000; // 30 seconds
  }

  /**
   * Initialize streaming orchestrator
   */
  async onInitialize() {
    // Wire service events
    this._wireStreamEvents();
    this._wireDeviceEvents();

    // Subscribe to canvas expiration (GPU worker terminated)
    this.subscribeWithCleanup({
      [EventChannels.RENDER.CANVAS_EXPIRED]: () => this._recreateCanvas()
    });

    // Initialize visibility handler
    this._visibilityHandler.initialize(
      () => this._handleVisible(),
      () => this._handleHidden()
    );

    // Initialize canvas size with default resolution
    this._setupCanvasSize();
  }

  /**
   * Handle page becoming visible
   * @private
   */
  _handleVisible() {
    if (this.appState.isStreaming) {
      // Resume rendering when visible
      if (this._useGPURenderer) {
        const video = this.uiController.elements.streamVideo;
        this._startGPURenderLoop(video);
        this.logger.debug('GPU rendering resumed (window visible)');
      } else {
        this._startCanvasRendering(this._currentCapabilities);
        this.logger.debug('Canvas rendering resumed (window visible)');
      }
    }
  }

  /**
   * Handle page becoming hidden
   * @private
   */
  _handleHidden() {
    if (this.appState.isStreaming) {
      // Pause rendering when hidden
      const video = this.uiController.elements.streamVideo;

      if (this._useGPURenderer) {
        this._stopGPURenderLoop(video);
        this.logger.debug('GPU rendering paused (window hidden)');
      } else {
        this._canvasRenderer.stopRendering(video);
        this.logger.debug('Canvas rendering paused (window hidden)');
      }
    }
  }

  /**
   * Calculate and set canvas dimensions based on available space
   * Single source of truth for canvas sizing - used by init, resize, and streaming
   * @param {Object} [nativeRes] - Native resolution override, defaults to stored or device default
   * @private
   */
  _setupCanvasSize(nativeRes = null) {
    const canvas = this.uiController.elements.streamCanvas;
    const container = canvas?.parentElement;
    const section = container?.parentElement;
    if (!canvas || !container || !section) return;

    // Use provided resolution, stored capabilities, or device default
    const resolution = nativeRes ||
      this._currentCapabilities?.nativeResolution ||
      { width: 160, height: 144 };

    // Calculate dimensions using ViewportManager
    const dimensions = this._viewportManager.calculateDimensions(canvas, resolution);
    if (!dimensions) return;

    // Apply dimensions - use GPU renderer if canvas was transferred, otherwise use canvas renderer
    if (this._gpuRendererService.isCanvasTransferred()) {
      // Canvas was transferred to GPU worker - resize through GPU renderer
      this._gpuRendererService.resize(dimensions.width, dimensions.height);
      // Update CSS size only (canvas backing store is managed by worker)
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
    } else {
      // Canvas still available - use canvas renderer for resize
      this._canvasRenderer.resize(canvas, dimensions.width, dimensions.height);
    }

    // Initialize viewport manager on first call
    if (!this._viewportManager._resizeObserver) {
      this._viewportManager.initialize(section, () => this._setupCanvasSize());
    }
  }

  /**
   * Recreate canvas element after GPU worker termination
   * Called when CANVAS_EXPIRED event fires (canvas was transferred and is now unusable)
   * @private
   */
  _recreateCanvas() {
    const oldCanvas = this.uiController.elements.streamCanvas;
    if (!oldCanvas) return;

    const parent = oldCanvas.parentElement;
    if (!parent) return;

    // Create new canvas with same attributes and styles
    const newCanvas = document.createElement('canvas');
    newCanvas.id = oldCanvas.id;
    newCanvas.className = oldCanvas.className;
    newCanvas.style.cssText = oldCanvas.style.cssText;
    newCanvas.width = oldCanvas.width;
    newCanvas.height = oldCanvas.height;

    // Replace in DOM
    parent.replaceChild(newCanvas, oldCanvas);

    // Update reference in uiController
    this.uiController.elements.streamCanvas = newCanvas;

    // Notify listeners to rebind event handlers (fixes memory leak from orphaned listeners)
    this.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });

    this.logger.info('Canvas element recreated for next GPU session');
  }

  /**
   * Start streaming
   * Uses AppState.deviceConnected instead of direct orchestrator call (decoupled)
   * @param {string} deviceId - Optional device ID
   */
  async start(deviceId = null) {
    if (!this.appState.deviceConnected) {
      this.logger.warn('Cannot start stream - device not connected');
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Please connect your device first', type: 'warning' });
      return;
    }

    try {
      await this.streamingService.start(deviceId);
    } catch (error) {
      this.logger.error('Failed to start stream:', error);
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${error.message}`, type: 'error' });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: error.message });
    }
  }

  /**
   * Stop streaming
   * @returns {Promise<void>} Resolves when stream is stopped
   */
  stop() {
    return this.streamingService.stop();
  }

  /**
   * Get current stream
   */
  getStream() {
    return this.streamingService.getStream();
  }

  /**
   * Check if streaming is active
   */
  isActive() {
    return this.streamingService.isActive();
  }

  /**
   * Wire stream events from StreamingService
   * @private
   */
  _wireStreamEvents() {
    this.subscribeWithCleanup({
      [EventChannels.STREAM.STARTED]: (data) => this._handleStreamStarted(data),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.STREAM.ERROR]: (error) => this._handleStreamError(error),
      [EventChannels.SETTINGS.RENDER_PRESET_CHANGED]: (presetId) => this._handleRenderPresetChanged(presetId)
    });
  }

  /**
   * Handle render preset change event
   * @param {string} presetId - New preset ID
   * @private
   */
  _handleRenderPresetChanged(presetId) {
    if (this._useGPURenderer && this._gpuRendererService.isActive()) {
      this._gpuRendererService.setPreset(presetId);
    }
  }

  /**
   * Wire device events
   * @private
   */
  _wireDeviceEvents() {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.DISCONNECTED_DURING_SESSION]: () => this._handleDeviceDisconnectedDuringStream()
    });
  }

  /**
   * Handle stream started event
   * @private
   */
  async _handleStreamStarted(data) {
    const { stream, settings, capabilities } = data;

    this.logger.info('Stream started event received');

    // Note: App state automatically derives isStreaming from StreamingService
    // No need to manually update appState.setStreaming() anymore

    // Assign stream to video element (requires direct element access)
    const video = this.uiController.elements.streamVideo;
    video.srcObject = stream;
    this.logger.info('Stream assigned to video element');

    // Update UI for streaming mode via event
    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

    // Display stream info via event
    if (settings && settings.video) {
      this.eventBus.publish(EventChannels.UI.STREAM_INFO, { settings: settings.video });
    }

    // Verify actual frame delivery (detects powered-off devices)
    try {
      await this._waitForHealthyStream(video);

      // Start canvas rendering with upscaling
      this._startCanvasRendering(capabilities);

      // Update status via event
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Streaming from camera' });
    } catch (error) {
      this.logger.error('Stream unhealthy:', error.message);

      // Show user-friendly message
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, {
        message: 'Device not sending video. Is it powered on?',
        type: 'warning'
      });
      this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, {
        message: 'Device not sending video. Please ensure the device is powered on.'
      });

      // Stop the unhealthy stream
      this.streamingService.stop();
    }
  }

  /**
   * Wait for healthy stream (actual frames arriving)
   * Uses StreamHealthMonitor to verify frame delivery via RVFC
   * @param {HTMLVideoElement} videoElement
   * @returns {Promise<void>}
   * @private
   */
  _waitForHealthyStream(videoElement) {
    return new Promise((resolve, reject) => {
      this._streamHealthMonitor.startMonitoring(
        videoElement,
        (frameData) => {
          this.logger.info('Stream verified healthy - first frame received');
          this.eventBus.publish(EventChannels.STREAM.HEALTH_OK, frameData);
          resolve();
        },
        (errorData) => {
          this.logger.warn(`Stream unhealthy: ${errorData.reason}`);
          this.eventBus.publish(EventChannels.STREAM.HEALTH_TIMEOUT, errorData);
          const error = new Error(`No frames received: ${errorData.reason}`);
          error.reason = errorData.reason;
          reject(error);
        },
        4000 // 4 second timeout for device initialization
      );
    });
  }

  /**
   * Handle stream stopped event
   * @private
   */
  _handleStreamStopped() {
    this.logger.info('Stream stopped event received');

    // Get video element reference (requires direct element access)
    const video = this.uiController.elements.streamVideo;

    // Stop rendering (GPU or Canvas2D)
    // Note: We intentionally do NOT cleanup or reset _useGPURenderer here.
    // The canvas control transfer is irreversible, so we keep the GPU pipeline
    // alive to reuse on the next stream start.
    if (this._useGPURenderer) {
      this._stopGPURenderLoop(video);
      // Keep _useGPURenderer = true so we reuse GPU renderer on next stream start
      // Start idle timer to release GPU resources after timeout (saves ~95MB)
      this._startIdleReleaseTimer();
    } else {
      this._canvasRenderer.stopRendering(video);
    }

    // Clear video element srcObject
    if (video.srcObject) {
      // Pause video before clearing srcObject
      video.pause();
      video.srcObject = null;
      // Reset video element state
      video.load();
      this.logger.info('Video element srcObject cleared and reset');
    }

    // Clear canvas to prevent stale frames (requires direct element access)
    // Skip if canvas was transferred to GPU renderer (cannot use 2D context)
    if (!this._gpuRendererService.isCanvasTransferred()) {
      const canvas = this.uiController.elements.streamCanvas;
      this._canvasRenderer.clearCanvas(canvas);
    }

    // Note: App state automatically derives isStreaming from StreamingService
    // No need to manually update appState.setStreaming() anymore

    // Update UI via events
    this.eventBus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });

    // Update overlay message based on device connection state via event
    // Uses AppState.deviceConnected instead of direct orchestrator call (decoupled)
    this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: this.appState.deviceConnected });
  }

  /**
   * Handle stream error event
   * @private
   */
  _handleStreamError(error) {
    this.logger.error('Stream error:', error);
    this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: `Error: ${error.message}`, type: 'error' });
    this.eventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: error.message });
  }

  /**
   * Handle device disconnected during active stream
   * @private
   */
  _handleDeviceDisconnectedDuringStream() {
    if (this.appState.isStreaming) {
      this.logger.warn('Device disconnected during stream - stopping');
      this.streamingService.stop();
    }
  }

  /**
   * Start rendering with pixel-perfect quality
   * Attempts GPU rendering first, falls back to Canvas2D
   * @private
   */
  async _startCanvasRendering(capabilities) {
    // Clear idle release timer when starting stream
    this._clearIdleReleaseTimer();

    // Store capabilities for visibility resume
    this._currentCapabilities = capabilities;

    const canvas = this.uiController.elements.streamCanvas;
    const video = this.uiController.elements.streamVideo;

    // Get native resolution from capabilities
    const nativeRes = capabilities?.nativeResolution || { width: 160, height: 144 };

    // Use unified canvas sizing method
    this._setupCanvasSize(nativeRes);

    // If GPU renderer is already set up (from previous stream), just start the render loop
    if (this._useGPURenderer && this._gpuRendererService.isActive()) {
      this.logger.info('Resuming GPU renderer (already initialized)');
      this._startGPURenderLoop(video);
      return;
    }

    // Try GPU rendering first (or reinitialize if needed)
    try {
      const gpuAvailable = await this._gpuRendererService.initialize(canvas, nativeRes);

      if (gpuAvailable) {
        this._useGPURenderer = true;
        this.logger.info('Using GPU renderer for HD rendering');
        this._startGPURenderLoop(video);
        return;
      } else {
        // GPU init returned false (e.g., re-init timeout) - reset flag for fallback
        this.logger.warn('GPU renderer not available, attempting Canvas2D fallback');
        this._useGPURenderer = false;
      }
    } catch (error) {
      this.logger.warn('GPU renderer initialization failed, falling back to Canvas2D:', error.message);
      this._useGPURenderer = false;
    }

    // Fall back to Canvas2D rendering
    // Only set _useGPURenderer = false if we weren't already using it
    if (!this._useGPURenderer) {
      // Check if canvas control was transferred - if so, we cannot use Canvas2D fallback
      if (this._gpuRendererService.isCanvasTransferred()) {
        this.logger.error('Canvas control was transferred to GPU renderer and cannot be recovered for Canvas2D fallback. Video will play but without rendering pipeline.');
        // The video element will still display the stream directly without canvas processing
        return;
      }

      this.logger.info('Using Canvas2D renderer');
      this._canvasRenderer.startRendering(
        video,
        canvas,
        () => this.appState.isStreaming,
        () => this._visibilityHandler.isHidden()
      );
    }
  }

  /**
   * Start the GPU render loop using requestVideoFrameCallback
   * Video is guaranteed to be ready (HAVE_CURRENT_DATA) before this is called
   * @param {HTMLVideoElement} videoElement
   * @private
   */
  _startGPURenderLoop(videoElement) {
    this._gpuRenderLoopActive = true;
    let lastFrameTime = -1;

    const renderFrame = async (now, metadata) => {
      if (!this._gpuRenderLoopActive) return;

      // Skip identical frames using video frame metadata
      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime !== lastFrameTime && videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        await this._gpuRendererService.renderFrame(videoElement);
        lastFrameTime = frameTime;
      }

      // Continue loop if streaming and visible
      if (this.appState.isStreaming && !this._visibilityHandler.isHidden()) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderFrame);
      }
    };

    // Start immediately - video is guaranteed ready by _waitForHealthyStream
    this._rvfcHandle = videoElement.requestVideoFrameCallback(renderFrame);
  }

  /**
   * Stop the GPU render loop
   * @param {HTMLVideoElement} videoElement
   * @private
   */
  _stopGPURenderLoop(videoElement) {
    this._gpuRenderLoopActive = false;

    if (this._rvfcHandle !== null && videoElement?.cancelVideoFrameCallback) {
      videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }
  }

  /**
   * Start idle release timer
   * After idle timeout, fully terminates GPU worker to flush Chromium GPU caches
   * @private
   */
  _startIdleReleaseTimer() {
    this._clearIdleReleaseTimer();

    this._idleReleaseTimeout = setTimeout(() => {
      if (this._useGPURenderer && !this.appState.isStreaming) {
        this.logger.info('GPU idle timeout - terminating worker to flush GPU caches');
        this._gpuRendererService.terminateAndReset();
        this._useGPURenderer = false;
      }
    }, this._idleReleaseDelay);
  }

  /**
   * Clear idle release timer
   * @private
   */
  _clearIdleReleaseTimer() {
    if (this._idleReleaseTimeout) {
      clearTimeout(this._idleReleaseTimeout);
      this._idleReleaseTimeout = null;
    }
  }

  /**
   * Cleanup resources
   * Note: EventBus subscriptions are automatically cleaned up by BaseOrchestrator
   */
  async onCleanup() {
    // Clear idle release timer
    this._clearIdleReleaseTimer();

    // Cleanup GPU renderer if active
    if (this._useGPURenderer) {
      const video = this.uiController.elements.streamVideo;
      this._stopGPURenderLoop(video);
      this._gpuRendererService.cleanup();
      this._useGPURenderer = false;
    }

    // Cleanup canvas renderer
    this._canvasRenderer.cleanup();

    // Cleanup other managers
    this._viewportManager.cleanup();
    this._visibilityHandler.cleanup();
    this._streamHealthMonitor.cleanup();

    // Stop streaming
    if (this.streamingService.isActive()) {
      this.streamingService.stop();
    }
  }
}
