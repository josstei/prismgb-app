/**
 * Viewport Service
 *
 * Manages viewport resizing and dimension calculations for canvas rendering.
 * Handles ResizeObserver lifecycle and calculates pixel-perfect scaling.
 *
 * Responsibilities:
 * - Observe viewport/container resize events
 * - Calculate integer scale factors for pixel-perfect rendering
 * - Debounce resize events
 * - Manage ResizeObserver lifecycle
 *
 * Single source of truth for canvas sizing - used by init, resize, and streaming
 */

import { TIMING } from '@shared/config/constants.config.js';

export class ViewportService {
  constructor(logger) {
    this.logger = logger;

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

    // Bind handler for cleanup
    this._handleResize = this._handleResize.bind(this);
  }

  /**
   * Initialize viewport manager
   * @param {HTMLElement} observeElement - Element to observe for resize (typically the section)
   * @param {Function} onResize - Callback to invoke when resize occurs
   */
  initialize(observeElement, onResize) {
    this._onResizeCallback = onResize;

    // Set up ResizeObserver
    if (!this._resizeObserver && observeElement) {
      this._resizeObserver = new ResizeObserver(this._handleResize);
      this._resizeObserver.observe(observeElement);
      this.logger.debug('ViewportService initialized with ResizeObserver');
    }
  }

  /**
   * Calculate dimensions for canvas based on available space and native resolution
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

    // Performance: cache computed styles (padding, border, gap don't change during session)
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

    // Account for sibling elements (e.g., controls) - must measure each time as they may show/hide
    let siblingsHeight = 0;
    for (const child of section.children) {
      if (child !== container) {
        siblingsHeight += child.offsetHeight;
      }
    }
    const siblingCount = section.children.length - 1;
    const totalGap = siblingCount > 0 ? gap * siblingCount : 0;

    // Use mainContent dimensions for stability (canvas doesn't affect its size)
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

  /**
   * Cleanup resources
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
  }
}
