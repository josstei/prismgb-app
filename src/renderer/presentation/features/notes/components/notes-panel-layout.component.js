/**
 * Notes Panel Layout Component
 *
 * Handles positioning and sizing for the notes panel.
 */

import { createDomListenerManager } from '@renderer/presentation/primitives/dom-listener.utils.js';

const RESIZE_DEBOUNCE_MS = 100;

class NotesPanelLayoutComponent {
  constructor({ logger }) {
    this.logger = logger;
    this._domListeners = createDomListenerManager({ logger });
    this._resizeObserver = null;
    this._resizeTimeout = null;
    this._panelSizeDefaults = null;

    this.panelElement = null;
    this.toolbarElement = null;
    this.streamContainer = null;
  }

  /**
   * Initialize layout with required elements
   * @param {Object} options
   * @param {HTMLElement} options.panelElement
   * @param {HTMLElement} options.toolbarElement
   * @param {HTMLElement} options.streamContainer
   */
  initialize({ panelElement, toolbarElement, streamContainer }) {
    this.panelElement = panelElement;
    this.toolbarElement = toolbarElement;
    this.streamContainer = streamContainer;

    if (!this.panelElement || !this.toolbarElement) return;

    this._panelSizeDefaults = this._getPanelSizeDefaults();
    this._setupResizeHandler();
    this.updatePosition();
  }

  /**
   * Update panel position based on toolbar location
   * Note: All DOM reads are batched first, then all writes are batched at the end
   * to avoid layout thrashing.
   */
  updatePosition() {
    if (!this.panelElement || !this.toolbarElement) return;

    // === BATCH ALL DOM READS FIRST ===
    const toolbarRect = this.toolbarElement.getBoundingClientRect();
    const panelStyles = window.getComputedStyle(this.panelElement);
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 16;
    const safeEdge = 8;
    const rightOffset = parseFloat(panelStyles.right) || 0;

    const defaults = this._panelSizeDefaults || {
      minWidth: 200,
      maxWidth: 450,
      minHeight: 300,
      maxHeight: 600
    };

    // === PERFORM ALL CALCULATIONS (no DOM access) ===
    const desiredLeft = Math.round(toolbarRect.right + gap);
    const availableWidth = viewportWidth - rightOffset - safeEdge - desiredLeft;
    let minWidth = defaults.minWidth;
    let maxWidth = defaults.maxWidth;

    const shouldDockBelow = availableWidth < defaults.minWidth;
    if (availableWidth > 0 && !shouldDockBelow) {
      minWidth = Math.min(minWidth, availableWidth);
      maxWidth = Math.min(maxWidth, availableWidth);
    } else if (shouldDockBelow) {
      const fallbackWidth = Math.max(1, viewportWidth - rightOffset - safeEdge * 2);
      maxWidth = Math.min(maxWidth, fallbackWidth);
      minWidth = Math.min(minWidth, maxWidth);
    }

    const maxFittableHeight = Math.max(200, viewportHeight - safeEdge * 2);
    let minHeight = Math.min(defaults.minHeight, maxFittableHeight);
    let maxHeight = defaults.maxHeight;

    const maxLeft = Math.max(safeEdge, viewportWidth - rightOffset - minWidth);
    const leftPos = shouldDockBelow
      ? Math.min(Math.max(Math.round(toolbarRect.left), safeEdge), maxLeft)
      : Math.min(desiredLeft, maxLeft);

    const desiredTop = shouldDockBelow
      ? Math.round(toolbarRect.bottom + gap)
      : Math.round(toolbarRect.top);

    if (shouldDockBelow) {
      const availableHeightBelow = Math.max(120, viewportHeight - desiredTop - safeEdge);
      maxHeight = Math.min(maxHeight, availableHeightBelow);
      minHeight = Math.min(minHeight, maxHeight);
    }

    const maxTop = Math.max(safeEdge, viewportHeight - minHeight - safeEdge);
    const topPos = Math.min(Math.max(desiredTop, safeEdge), maxTop);

    // === BATCH ALL DOM WRITES AT THE END ===
    this.panelElement.style.setProperty('--notes-panel-min-width', `${Math.round(minWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-width', `${Math.round(maxWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-min-height', `${Math.round(minHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-height', `${Math.round(maxHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-left', `${leftPos}px`);
    this.panelElement.style.setProperty('--notes-panel-top', `${topPos}px`);
  }

  /**
   * Setup window resize handler to update panel position with debouncing
   * @private
   */
  _setupResizeHandler() {
    this._domListeners.add(window, 'resize', () => {
      this._schedulePositionUpdate();
    });

    if (!this.streamContainer || typeof ResizeObserver === 'undefined') return;

    this._resizeObserver = new ResizeObserver(() => {
      this._schedulePositionUpdate();
    });
    this._resizeObserver.observe(this.streamContainer);
  }

  /**
   * Schedule position update with debounce
   * @private
   */
  _schedulePositionUpdate() {
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }

    this._resizeTimeout = setTimeout(() => {
      this._resizeTimeout = null;
      this.updatePosition();
    }, RESIZE_DEBOUNCE_MS);
  }

  _getPanelSizeDefaults() {
    if (!this.panelElement) return null;

    const styles = window.getComputedStyle(this.panelElement);
    const minWidth = parseFloat(styles.minWidth);
    const maxWidth = parseFloat(styles.maxWidth);
    const minHeight = parseFloat(styles.minHeight);
    const maxHeight = parseFloat(styles.maxHeight);

    return {
      minWidth: Number.isFinite(minWidth) ? minWidth : 200,
      maxWidth: Number.isFinite(maxWidth) ? maxWidth : 450,
      minHeight: Number.isFinite(minHeight) ? minHeight : 300,
      maxHeight: Number.isFinite(maxHeight) ? maxHeight : 600
    };
  }

  /**
   * Cleanup resources
   */
  dispose() {
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    this._domListeners.removeAll();

    this.panelElement = null;
    this.toolbarElement = null;
    this.streamContainer = null;
    this._panelSizeDefaults = null;
  }
}

export { NotesPanelLayoutComponent };
