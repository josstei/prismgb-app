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

import { BaseService } from '@shared/base/service.base.js';
import { TIMING } from '@shared/config/timing.config';
import type {
  LoggerFactoryLike
} from '@shared/interfaces/infrastructure.types.js';
import type { Dimensions } from '@renderer/infrastructure/streaming/streaming-contracts.js';

type StreamingViewportDependencies = {
  loggerFactory: LoggerFactoryLike;
};

type ResizeDimensions = Dimensions & {
  scale: number;
};

type CachedViewportStyles = {
  paddingX: number;
  paddingY: number;
  borderX: number;
  borderY: number;
  gap: number;
};

const RESIZE_OBSERVER_LIFECYCLE = Symbol('streamingViewportResizeObserver');
const RESIZE_DEBOUNCE_LIFECYCLE = Symbol('streamingViewportResizeDebounce');
const FORCE_RESIZE_LIFECYCLE = Symbol('streamingViewportForceResize');

export class StreamingViewportService extends BaseService {
  private _resizeObserver: ResizeObserver | null;
  private _onResizeCallback: (() => void) | null;
  private _lastDimensions: ResizeDimensions | null;
  private _forceResizePending: boolean;
  private _cachedStyles: CachedViewportStyles | null;

  constructor(dependencies: StreamingViewportDependencies) {
    super(dependencies, ['loggerFactory'], 'StreamingViewportService');

    // ResizeObserver for canvas resize handling
    this._resizeObserver = null;

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

  initialize(observeElement: HTMLElement | null, onResize: () => void): void {
    this._onResizeCallback = onResize;

    // Set up ResizeObserver
    if (!this._resizeObserver && observeElement) {
      const resizeObserver = new ResizeObserver(this._handleResize);
      resizeObserver.observe(observeElement);
      this._resizeObserver = resizeObserver;
      this.disposables.replace(RESIZE_OBSERVER_LIFECYCLE, () => {
        resizeObserver.disconnect();
        if (this._resizeObserver === resizeObserver) {
          this._resizeObserver = null;
        }
        this.logger.debug('ResizeObserver disconnected');
      });
      this.logger.debug('StreamingViewportService initialized with ResizeObserver');
    }
  }

  isInitialized(): boolean {
    return Boolean(this._resizeObserver);
  }

  calculateDimensions(
    canvas: HTMLCanvasElement,
    nativeResolution: Dimensions
  ): ResizeDimensions | null {
    const container = canvas?.parentElement;
    const section = container?.parentElement;
    const mainContent = section?.parentElement;

    if (!canvas || !container || !section || !mainContent) {
      this.logger.warn('Cannot calculate dimensions - missing elements');
      return null;
    }

    // === BATCH DOM READS: Cache computed styles (padding, border, gap don't change during session) ===
    const cachedStyles = this._cachedStyles ?? (() => {
      const sectionStyle = window.getComputedStyle(section);
      const containerStyle = window.getComputedStyle(container);
      return {
        paddingX: parseFloat(sectionStyle.paddingLeft) + parseFloat(sectionStyle.paddingRight),
        paddingY: parseFloat(sectionStyle.paddingTop) + parseFloat(sectionStyle.paddingBottom),
        borderX: parseFloat(containerStyle.borderLeftWidth) + parseFloat(containerStyle.borderRightWidth),
        borderY: parseFloat(containerStyle.borderTopWidth) + parseFloat(containerStyle.borderBottomWidth),
        gap: parseFloat(sectionStyle.gap) || 0
      };
    })();
    this._cachedStyles = cachedStyles;

    const { paddingX, paddingY, borderX, borderY, gap } = cachedStyles;

    // === BATCH DOM READS: Measure sibling elements (may show/hide) ===
    let siblingsHeight = 0;
    for (const child of section.children) {
      if (child !== container && child instanceof HTMLElement) {
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

  _handleResize(): void {
    // Skip if forceResize is pending (prevents race condition during fullscreen transitions)
    if (this._forceResizePending) {
      return;
    }

    // Debounce resize events
    this.disposables.cancel(RESIZE_DEBOUNCE_LIFECYCLE);
    const resizeTimeout = setTimeout(() => {
      this.disposables.cancel(RESIZE_DEBOUNCE_LIFECYCLE);
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, TIMING.RESIZE_DEBOUNCE_MS);
    this.disposables.replace(RESIZE_DEBOUNCE_LIFECYCLE, () => clearTimeout(resizeTimeout));
  }

  /**
   * Reset cached dimension tracking without tearing down observers
   */
  resetDimensions(): void {
    this._lastDimensions = null;
  }

  /**
   * Force a resize after window finishes resizing.
   * Suppresses ResizeObserver callbacks while pending to prevent race conditions.
   * Uses short delay to ensure CSS layout has recalculated after fullscreen change.
   */
  forceResize(): void {
    // Cancel any pending resize (both ResizeObserver debounce and forceResize)
    this.disposables.cancel(RESIZE_DEBOUNCE_LIFECYCLE);
    this.disposables.cancel(FORCE_RESIZE_LIFECYCLE);

    // Suppress ResizeObserver callbacks while forceResize is pending
    this._forceResizePending = true;

    // Reset cached dimensions and styles to force recalculation
    this._lastDimensions = null;
    this._cachedStyles = null;

    // Short delay (2 frames) to ensure layout has settled after CSS changes
    const forceResizeTimeout = setTimeout(() => {
      this.disposables.cancel(FORCE_RESIZE_LIFECYCLE);
      this._forceResizePending = false;
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, 32);
    this.disposables.replace(FORCE_RESIZE_LIFECYCLE, () => clearTimeout(forceResizeTimeout));
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.disposables.cancel(FORCE_RESIZE_LIFECYCLE);
    this.disposables.cancel(RESIZE_DEBOUNCE_LIFECYCLE);
    this.disposables.cancel(RESIZE_OBSERVER_LIFECYCLE);

    // Clear callback
    this._onResizeCallback = null;

    // Reset state
    this._lastDimensions = null;
    this._forceResizePending = false;
    this._cachedStyles = null;
  }

  /**
   * Dispose the service
   */
  override dispose(): void | Promise<void> {
    this.cleanup();
    const disposed = super.dispose();
    this.logger.info('StreamingViewportService disposed');
    return disposed;
  }
}
