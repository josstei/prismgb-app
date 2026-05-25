/**
 * Notes Panel Layout Component
 *
 * Handles positioning and sizing for the notes panel.
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { calculateAnchoredDisclosureLayout } from '@renderer/presentation/primitives/disclosure.class.js';

const RESIZE_DEBOUNCE_MS = 100;
const RESIZE_DEBOUNCE_TIMEOUT = Symbol('notesPanelLayoutResizeDebounceTimeout');
const LAYOUT_SETUP_LIFECYCLE = Symbol('notesPanelLayoutSetupLifecycle');

class NotesPanelLayoutComponent extends PresentationComponent {
  constructor({ logger }) {
    super();
    this.logger = logger;
    this._resizeObserver = null;
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
    this.cancelManaged(LAYOUT_SETUP_LIFECYCLE);
    this.cancelManaged(RESIZE_DEBOUNCE_TIMEOUT);
    this._resizeObserver = null;
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
    const anchoredLayout = calculateAnchoredDisclosureLayout({
      anchorRect: toolbarRect,
      viewportWidth,
      viewportHeight,
      rightOffset,
      sizeDefaults: defaults,
      gap,
      safeEdge
    });

    // === BATCH ALL DOM WRITES AT THE END ===
    this.panelElement.style.setProperty('--notes-panel-min-width', `${Math.round(anchoredLayout.minWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-width', `${Math.round(anchoredLayout.maxWidth)}px`);
    this.panelElement.style.setProperty('--notes-panel-min-height', `${Math.round(anchoredLayout.minHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-max-height', `${Math.round(anchoredLayout.maxHeight)}px`);
    this.panelElement.style.setProperty('--notes-panel-left', `${anchoredLayout.left}px`);
    this.panelElement.style.setProperty('--notes-panel-top', `${anchoredLayout.top}px`);
  }

  /**
   * Setup window resize handler to update panel position with debouncing
   * @private
   */
  _setupResizeHandler() {
    const disposers = [this.listen(window, 'resize', () => {
      this._schedulePositionUpdate();
    })];

    if (this.streamContainer && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._schedulePositionUpdate();
      });
      this._resizeObserver.observe(this.streamContainer);
      disposers.push(this.observe(this._resizeObserver));
    }

    this.replaceManaged(LAYOUT_SETUP_LIFECYCLE, () => {
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        disposers[index]();
      }
      this._resizeObserver = null;
    });
  }

  /**
   * Schedule position update with debounce
   * @private
   */
  _schedulePositionUpdate() {
    this.replaceTimeout(RESIZE_DEBOUNCE_TIMEOUT, () => {
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
    super.dispose();

    this.panelElement = null;
    this.toolbarElement = null;
    this.streamContainer = null;
    this._resizeObserver = null;
    this._panelSizeDefaults = null;
  }
}

export { NotesPanelLayoutComponent };
