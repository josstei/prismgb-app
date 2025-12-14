/**
 * Canvas Renderer
 *
 * Manages canvas rendering and animation frame lifecycle.
 * Uses requestVideoFrameCallback (RVFC) for frame-synced rendering.
 *
 * Responsibilities:
 * - Start/stop rendering loop
 * - Manage RVFC handles for cleanup
 * - Frame skipping optimization
 * - Canvas context caching
 * - Pixel-perfect rendering (no image smoothing)
 *
 * Performance optimizations:
 * - Context caching to avoid repeated getContext calls
 * - Frame skipping to avoid rendering identical frames
 * - Desynchronized rendering for lower latency
 */

export class CanvasRenderer {
  /**
   * Create a canvas renderer
   * @param {Object} logger - Logger instance for debugging
   * @param {AnimationCache} animationCache - Animation frame management utility
   */
  constructor(logger, animationCache) {
    this.logger = logger;
    this.animationCache = animationCache;

    // Cache canvas context to avoid repeated getContext calls
    this._cachedContext = null;
    this._cachedCanvas = null;

    // Track render loop for cleanup
    this._renderLoopActive = false;

    // Frame skipping - track last rendered frame to avoid redundant draws
    this._lastFrameTime = -1;

    // Track RVFC handle for proper cancellation
    this._rvfcHandle = null;

    // Track loadeddata listener for cleanup
    this._loadedDataHandler = null;
    this._currentVideoElement = null;

    // HiDPI support - track display dimensions separate from backing store
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
  }

  /**
   * Start rendering video frames to canvas
   * Uses requestVideoFrameCallback for frame-synced rendering with automatic
   * frame skipping to avoid redundant draws.
   * @param {HTMLVideoElement} videoElement - Video element to capture frames from
   * @param {HTMLCanvasElement} canvasElement - Canvas element to render to
   * @param {Function} isStreamingFn - Returns true if streaming is active
   * @param {Function} isHiddenFn - Returns true if page is hidden (pause rendering)
   */
  startRendering(videoElement, canvasElement, isStreamingFn, isHiddenFn) {
    this._renderLoopActive = true;
    this._lastFrameTime = -1;

    // Cache canvas context to avoid repeated getContext calls
    if (this._cachedCanvas !== canvasElement || !this._cachedContext) {
      this._cachedCanvas = canvasElement;
      this._cachedContext = canvasElement.getContext('2d', {
        alpha: false,
        desynchronized: true, // Reduce latency on supported browsers
        willReadFrequently: false
      });

      // Apply DPR transform for HiDPI rendering
      const dpr = window.devicePixelRatio || 1;
      this._devicePixelRatio = dpr;
      this._cachedContext.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const ctx = this._cachedContext;

    // Disable ALL image smoothing for pixel-perfect rendering
    this._disableImageSmoothing(ctx);

    // Use requestVideoFrameCallback for frame-synced rendering
    const renderVideoFrame = (now, metadata) => {
      if (!this._renderLoopActive) return;

      // Skip identical frames - check mediaTime from video frame metadata
      const frameTime = metadata?.mediaTime ?? now;
      if (frameTime === this._lastFrameTime) {
        // Still schedule next frame check
        if (isStreamingFn() && !isHiddenFn()) {
          this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
        }
        return;
      }

      // Render the frame - use display dimensions (not backing store) for HiDPI support
      // The DPR transform scales coordinates to fill the backing store
      if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        const drawWidth = this._displayWidth || canvasElement.width;
        const drawHeight = this._displayHeight || canvasElement.height;
        ctx.drawImage(videoElement, 0, 0, drawWidth, drawHeight);
        this._lastFrameTime = frameTime;
      }

      // Only continue if streaming and visible
      if (isStreamingFn() && !isHiddenFn()) {
        this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
      }
    };

    // Clean up any existing loadeddata listener
    this._removeLoadedDataListener();

    // Track current video element for cleanup
    this._currentVideoElement = videoElement;

    // Wait for video to be ready
    this._loadedDataHandler = () => {
      this.logger.debug('Video loaded, starting canvas rendering');
      this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
      // Clean up listener reference after it fires
      this._loadedDataHandler = null;
    };
    videoElement.addEventListener('loadeddata', this._loadedDataHandler, { once: true });

    // Start immediately if video already loaded
    if (videoElement.readyState >= videoElement.HAVE_ENOUGH_DATA) {
      this.logger.debug('Video ready, starting render');
      this._rvfcHandle = videoElement.requestVideoFrameCallback(renderVideoFrame);
    }
  }

  /**
   * Remove loadeddata listener if still attached
   * @private
   */
  _removeLoadedDataListener() {
    if (this._loadedDataHandler && this._currentVideoElement) {
      this._currentVideoElement.removeEventListener('loadeddata', this._loadedDataHandler);
      this._loadedDataHandler = null;
    }
  }

  /**
   * Stop the rendering loop and cleanup resources
   * Cancels any pending video frame callbacks and removes event listeners.
   * @param {HTMLVideoElement} videoElement - Video element for RVFC cancellation
   */
  stopRendering(videoElement) {
    // Stop render loop
    this._renderLoopActive = false;

    // Remove loadeddata listener if still attached
    this._removeLoadedDataListener();

    // Cancel RVFC handle if active
    if (this._rvfcHandle !== null && videoElement?.cancelVideoFrameCallback) {
      videoElement.cancelVideoFrameCallback(this._rvfcHandle);
      this._rvfcHandle = null;
    }

    // Clear video element reference
    this._currentVideoElement = null;

    // Cancel canvas rendering via animation cache
    this.animationCache.cancelAnimation('canvasRender');

    this.logger.debug('Canvas rendering stopped');
  }

  /**
   * Clear canvas with black background
   * @param {HTMLCanvasElement} canvasElement - Canvas to clear
   */
  clearCanvas(canvasElement) {
    const ctx = canvasElement.getContext('2d');

    // Fill with black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);

    this.logger.debug('Canvas cleared');
  }

  /**
   * Resize canvas with HiDPI support
   * Sets backing store to displaySize * devicePixelRatio for sharp rendering
   * on high-DPI displays.
   * @param {HTMLCanvasElement} canvasElement - Canvas to resize
   * @param {number} width - Display width in CSS pixels
   * @param {number} height - Display height in CSS pixels
   */
  resize(canvasElement, width, height) {
    const dpr = window.devicePixelRatio || 1;
    const backingWidth = Math.round(width * dpr);
    const backingHeight = Math.round(height * dpr);

    // Only update if dimensions or DPR changed
    const dimensionsChanged = canvasElement.width !== backingWidth ||
                              canvasElement.height !== backingHeight ||
                              this._devicePixelRatio !== dpr;

    if (dimensionsChanged) {
      // Store display dimensions and DPR for use during draws
      this._displayWidth = width;
      this._displayHeight = height;
      this._devicePixelRatio = dpr;

      // Set backing store to display size * DPR for HiDPI sharpness
      canvasElement.width = backingWidth;
      canvasElement.height = backingHeight;

      // Set CSS dimensions to display size (not backing store)
      canvasElement.style.width = width + 'px';
      canvasElement.style.height = height + 'px';

      // Apply DPR transform so drawing coordinates match display pixels
      if (this._cachedContext) {
        this._cachedContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Re-disable image smoothing after dimension change (resets context state)
      this._disableImageSmoothing(this._cachedContext);

      this.logger.debug(`Canvas resized to ${width}x${height} (backing: ${backingWidth}x${backingHeight}, DPR: ${dpr})`);
    }
  }

  /**
   * Disable image smoothing on canvas context for pixel-perfect rendering
   * @param {CanvasRenderingContext2D} ctx - Canvas 2D context
   * @private
   */
  _disableImageSmoothing(ctx) {
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
  }

  /**
   * Check if Canvas2D rendering is currently active
   * @returns {boolean} True if render loop is running
   */
  isActive() {
    return this._renderLoopActive;
  }

  /**
   * Cleanup all resources and stop rendering
   * Cancels animations, clears cached context, and removes event listeners.
   */
  cleanup() {
    // Stop render loop
    this._renderLoopActive = false;

    // Remove loadeddata listener if still attached
    this._removeLoadedDataListener();

    // Cancel RVFC handle if active
    if (this._rvfcHandle !== null && this._currentVideoElement?.cancelVideoFrameCallback) {
      this._currentVideoElement.cancelVideoFrameCallback(this._rvfcHandle);
    }

    // Cancel all tracked animations
    this.animationCache.cancelAllAnimations();

    // Clear cached context and references
    this._cachedContext = null;
    this._cachedCanvas = null;
    this._rvfcHandle = null;
    this._currentVideoElement = null;

    // Reset HiDPI tracking
    this._displayWidth = 0;
    this._displayHeight = 0;
    this._devicePixelRatio = 1;
  }
}
