/**
 * Viewport Manager
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

import { TIMING } from '@shared/config/constants.js';

export class ViewportManager {
  constructor(logger) {
    this.logger = logger;

    // ResizeObserver for canvas resize handling
    this._resizeObserver = null;
    this._resizeTimeout = null;

    // Callback to invoke when resize occurs
    this._onResizeCallback = null;

    // Track last dimensions to skip redundant calculations
    this._lastDimensions = null;

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
      this.logger.debug('ViewportManager initialized with ResizeObserver');
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

    // Use mainContent for stable measurement (not affected by canvas size)
    // This breaks the circular dependency that causes oscillation
    const sectionStyle = window.getComputedStyle(section);
    const containerStyle = window.getComputedStyle(container);
    const paddingX = parseFloat(sectionStyle.paddingLeft) + parseFloat(sectionStyle.paddingRight);
    const paddingY = parseFloat(sectionStyle.paddingTop) + parseFloat(sectionStyle.paddingBottom);
    const borderX = parseFloat(containerStyle.borderLeftWidth) + parseFloat(containerStyle.borderRightWidth);
    const borderY = parseFloat(containerStyle.borderTopWidth) + parseFloat(containerStyle.borderBottomWidth);

    // Account for sibling elements (e.g., controls) and gap between flex items
    const gap = parseFloat(sectionStyle.gap) || 0;
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
    // Debounce resize events
    if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
    this._resizeTimeout = setTimeout(() => {
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, TIMING.RESIZE_DEBOUNCE_MS);
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

    // Clear timeout
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }

    // Clear callback
    this._onResizeCallback = null;

    // Reset dimension tracking
    this._lastDimensions = null;
  }
}
