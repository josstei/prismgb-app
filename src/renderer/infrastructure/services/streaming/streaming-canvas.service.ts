/**
 * Streaming Canvas Service
 *
 * Unified service managing all canvas-related concerns for streaming:
 * - DOM element access (video, canvas, containers)
 * - Viewport dimensions and resize handling
 * - Canvas lifecycle (creation, recreation, expiration)
 *
 * Consolidates:
 * - StreamingViewService (DOM element access)
 * - StreamingViewportService (viewport/resize management)
 * - StreamingCanvasLifecycleService (canvas lifecycle)
 *
 * Responsibilities:
 * - Provide access to video and canvas elements
 * - Calculate viewport dimensions with pixel-perfect scaling
 * - Observe and debounce resize events
 * - Manage canvas creation and recreation for GPU contexts
 * - Handle fullscreen transitions
 */

import { BaseService } from '@prismgb/core';
import { EventChannels } from '@renderer/common/config/event-channels';
import { TIMING } from '@renderer/common/config/timing.config';

export class StreamingCanvasService extends BaseService {
  static readonly dependencies = [
    'uiController',
    'canvasRenderer',
    'gpuRendererService',
    'eventBus',
    'loggerFactory'
  ] as const;

  constructor(dependencies) {
    super(dependencies, [...StreamingCanvasService.dependencies], 'StreamingCanvasService');

    // ResizeObserver for canvas resize handling
    this._resizeObserver = null;
    this._resizeTimeout = null;
    this._forceResizeTimeout = null;

    // Callback to invoke when resize occurs
    this._onResizeCallback = null;

    // Track last dimensions to skip redundant calculations
    this._lastDimensions = null;

    // Flag to suppress ResizeObserver during forceResize (prevents race condition)
    this._forceResizePending = false;

    // Performance: cached computed style values (don't change during session)
    this._cachedStyles = null;

    // Canvas lifecycle state
    this._nativeResolution = null;
    this._useGpuRenderer = false;

    // Bind handler for cleanup
    this._handleResize = this._handleResize.bind(this);
  }

  // ========================================
  // DOM Element Access (from StreamingViewService)
  // ========================================

  /**
   * Attaches a MediaStream to the video element with mute enforced.
   * @param {MediaStream} stream - The media stream to attach
   */
  attachMutedStream(stream) {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    // Keep video element muted; audio is handled by Web Audio pipeline.
    video.muted = true;
    video.srcObject = stream;
    this.logger.info('Stream assigned to video element');
  }

  /**
   * Clears the video element's stream and resets it.
   */
  clearStream() {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    if (video.srcObject) {
      video.pause();
      video.srcObject = null;
      video.load();
      this.logger.info('Video element srcObject cleared and reset');
    }
  }

  /**
   * Sets the muted state of the video element.
   * @param {boolean} muted - Whether the video should be muted
   */
  setMuted(muted) {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    video.muted = Boolean(muted);
  }

  /**
   * Gets the stream video element.
   * @returns {HTMLVideoElement|null} The video element or null if not found
   */
  getVideo() {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return null;
    }
    return video;
  }

  /**
   * Gets the stream canvas element.
   * @returns {HTMLCanvasElement|null} The canvas element or null if not found
   */
  getCanvas() {
    const canvas = this.uiController.elements.streamCanvas;
    if (!canvas) {
      this.logger.warn('Stream canvas element not found');
      return null;
    }
    return canvas;
  }

  /**
   * Gets the canvas container element (parent of canvas).
   * @returns {HTMLElement|null} The canvas container element or null if not found
   */
  getCanvasContainer() {
    const canvas = this.getCanvas();
    if (!canvas) return null;

    const container = canvas.parentElement;
    if (!container) {
      this.logger.warn('Canvas container element not found');
      return null;
    }
    return container;
  }

  /**
   * Gets the canvas section element (parent of canvas container, used for resize observer).
   * @returns {HTMLElement|null} The canvas section element or null if not found
   */
  getCanvasSection() {
    const container = this.getCanvasContainer();
    if (!container) return null;

    const section = container.parentElement;
    if (!section) {
      this.logger.warn('Canvas section element not found');
      return null;
    }
    return section;
  }

  /**
   * Updates the canvas element reference (used when canvas is recreated for WebGPU).
   * @param {HTMLCanvasElement} canvas - The new canvas element
   */
  setCanvas(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      this.logger.warn('Invalid canvas element provided to setCanvas');
      return;
    }
    this.uiController.setStreamCanvas(canvas);
    this.logger.info('Canvas element reference updated');
  }

  // ========================================
  // Viewport Resize Management (from StreamingViewportService)
  // ========================================

  /**
   * Initialize viewport manager
   * @param {HTMLElement} observeElement - Element to observe for resize (typically the section)
   * @param {Function} onResize - Callback to invoke when resize occurs
   */
  initializeViewport(observeElement, onResize) {
    this._onResizeCallback = onResize;

    // Set up ResizeObserver
    if (!this._resizeObserver && observeElement) {
      this._resizeObserver = new ResizeObserver(this._handleResize);
      this._resizeObserver.observe(observeElement);
      this.logger.debug('ResizeObserver initialized');
    }
  }

  /**
   * Check if ResizeObserver is set up
   * @returns {boolean} True if initialized
   */
  isViewportInitialized() {
    return Boolean(this._resizeObserver);
  }

  /**
   * Calculate dimensions for canvas based on available space and native resolution.
   * This is a read-only method that batches all DOM reads to avoid layout thrashing.
   * The caller is responsible for applying the returned dimensions to the canvas.
   *
   * @param {HTMLCanvasElement} canvas - Canvas element
   * @param {Object} nativeResolution - Native resolution {width, height}
   * @returns {Object|null} Calculated dimensions {width, height, scale}, or null if unchanged
   */
  calculateDimensions(canvas, nativeResolution) {
    const container = canvas?.parentElement;
    const section = container?.parentElement;
    const mainContent = section?.parentElement;

    if (!canvas || !container || !section || !mainContent) {
      this.logger.warn('Cannot calculate dimensions - missing elements');
      return null;
    }

    // === BATCH DOM READS: Cache computed styles (padding, border, gap don't change during session) ===
    if (!this._cachedStyles) {
      const sectionStyle = window.getComputedStyle(section);
      const containerStyle = window.getComputedStyle(container);
      this._cachedStyles = {
        paddingX: parseFloat(sectionStyle.paddingLeft) + parseFloat(sectionStyle.paddingRight),
        paddingY: parseFloat(sectionStyle.paddingTop) + parseFloat(sectionStyle.paddingBottom),
        borderX: parseFloat(containerStyle.borderLeftWidth) + parseFloat(containerStyle.borderRightWidth),
        borderY: parseFloat(containerStyle.borderTopWidth) + parseFloat(containerStyle.borderBottomWidth),
        gap: parseFloat(sectionStyle.gap) || 0
      };
    }

    const { paddingX, paddingY, borderX, borderY, gap } = this._cachedStyles;

    // === BATCH DOM READS: Measure sibling elements (may show/hide) ===
    let siblingsHeight = 0;
    for (const child of section.children) {
      if (child !== container) {
        siblingsHeight += child.offsetHeight;
      }
    }
    const siblingCount = section.children.length - 1;
    const totalGap = siblingCount > 0 ? gap * siblingCount : 0;

    // === BATCH DOM READS: Get container dimensions ===
    const availableWidth = mainContent.clientWidth - paddingX - borderX;
    const availableHeight = mainContent.clientHeight - paddingY - borderY - siblingsHeight - totalGap;

    // Calculate integer scale factor for pixel-perfect rendering
    const scaleX = availableWidth / nativeResolution.width;
    const scaleY = availableHeight / nativeResolution.height;
    const scale = Math.max(1, Math.floor(Math.min(scaleX, scaleY)));

    const width = nativeResolution.width * scale;
    const height = nativeResolution.height * scale;

    // Skip if dimensions unchanged
    if (this._lastDimensions?.width === width && this._lastDimensions?.height === height) {
      return null;
    }

    this._lastDimensions = { width, height, scale };
    this.logger.debug(`Calculated dimensions: ${width}x${height} (${scale}x scale, siblings: ${siblingsHeight}px, gap: ${totalGap}px)`);

    return { width, height, scale };
  }

  /**
   * Handle resize events with debouncing
   * @private
   */
  _handleResize() {
    // Skip if forceResize is pending (prevents race condition during fullscreen transitions)
    if (this._forceResizePending) {
      return;
    }

    // Debounce resize events
    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
    this._resizeTimeout = setTimeout(() => {
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, TIMING.RESIZE_DEBOUNCE_MS);
  }

  /**
   * Reset cached dimension tracking without tearing down observers
   */
  resetDimensions() {
    this._lastDimensions = null;
  }

  /**
   * Force a resize after window finishes resizing.
   * Suppresses ResizeObserver callbacks while pending to prevent race conditions.
   * Uses short delay to ensure CSS layout has recalculated after fullscreen change.
   */
  forceResize() {
    // Cancel any pending resize (both ResizeObserver debounce and forceResize)
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }
    if (this._forceResizeTimeout) {
      clearTimeout(this._forceResizeTimeout);
    }

    // Suppress ResizeObserver callbacks while forceResize is pending
    this._forceResizePending = true;

    // Reset cached dimensions and styles to force recalculation
    this._lastDimensions = null;
    this._cachedStyles = null;

    // Short delay (2 frames) to ensure layout has settled after CSS changes
    this._forceResizeTimeout = setTimeout(() => {
      this._forceResizeTimeout = null;
      this._forceResizePending = false;
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, 32);
  }

  // ========================================
  // Canvas Lifecycle Management (from StreamingCanvasLifecycleService)
  // ========================================

  /**
   * Initialize canvas lifecycle
   * @param {Object} nativeResolution - Native resolution {width, height}
   */
  initialize(nativeResolution) {
    this.setupCanvasSize(nativeResolution);
  }

  /**
   * Handle canvas expiration (WebGPU context lost)
   */
  handleCanvasExpired() {
    this.recreateCanvas();
    this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer);
  }

  /**
   * Handle fullscreen state change - immediately resize canvas without debounce delay.
   * This prevents the visual glitch where canvas appears mispositioned during fullscreen transitions.
   */
  handleFullscreenChange() {
    this.forceResize();
  }

  /**
   * Set up canvas size and initialize viewport observer
   * @param {Object} nativeResolution - Native resolution {width, height}
   * @param {boolean} useGpu - Whether GPU renderer is active
   */
  setupCanvasSize(nativeResolution = null, useGpu = false) {
    const canvas = this.getCanvas();
    const container = this.getCanvasContainer();
    const section = this.getCanvasSection();
    if (!canvas || !container || !section) return;

    const resolution = nativeResolution || { width: 160, height: 144 };
    this._nativeResolution = resolution;
    this._useGpuRenderer = useGpu;

    const dimensions = this.calculateDimensions(canvas, resolution);
    if (!dimensions) return;

    if (this.gpuRendererService.isCanvasTransferred()) {
      this.gpuRendererService.resize(dimensions.width, dimensions.height);
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
    } else {
      this.canvasRenderer.resize(canvas, dimensions.width, dimensions.height);
    }

    if (!this.isViewportInitialized()) {
      this.initializeViewport(section, () =>
        this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer)
      );
    }
  }

  /**
   * Recreate canvas element (for WebGPU context reacquisition)
   */
  recreateCanvas() {
    const oldCanvas = this.getCanvas();
    if (!oldCanvas) return;

    const parent = oldCanvas.parentElement;
    if (!parent) return;

    const newCanvas = document.createElement('canvas');
    newCanvas.id = oldCanvas.id;
    newCanvas.className = oldCanvas.className;

    const computedStyle = window.getComputedStyle(oldCanvas);
    newCanvas.style.position = computedStyle.position;
    newCanvas.style.top = computedStyle.top;
    newCanvas.style.left = computedStyle.left;
    newCanvas.style.transform = computedStyle.transform;

    parent.replaceChild(newCanvas, oldCanvas);

    this.setCanvas(newCanvas);

    this.canvasRenderer.resetCanvasState();
    this.resetDimensions();

    this.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });

    this.logger.info('Canvas element recreated for next GPU session');
  }

  // ========================================
  // Cleanup
  // ========================================

  /**
   * Cleanup all resources
   */
  cleanup() {
    // Clean up ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
      this.logger.debug('ResizeObserver disconnected');
    }

    // Clear timeouts
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }
    if (this._forceResizeTimeout) {
      clearTimeout(this._forceResizeTimeout);
      this._forceResizeTimeout = null;
    }

    // Clear callback
    this._onResizeCallback = null;

    // Reset state
    this._lastDimensions = null;
    this._forceResizePending = false;
    this._cachedStyles = null;
    this._nativeResolution = null;
    this._useGpuRenderer = false;
  }

  /**
   * Dispose the service
   */
  dispose() {
    this.cleanup();
    this.logger.info('StreamingCanvasService disposed');
  }
}
