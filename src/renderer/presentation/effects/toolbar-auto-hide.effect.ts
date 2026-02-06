// @ts-nocheck
/**
 * ToolbarAutoHide - Manages toolbar auto-hiding during streaming
 *
 * Hides the streaming toolbar after inactivity.
 * Pauses hiding when hovering or when a panel is open.
 * Coordinates with cursor auto-hide through callbacks.
 */

import { CSSClasses } from '@renderer/presentation/config/css-classes.config';

export class ToolbarAutoHide {
  /**
   * @param {Object} options
   * @param {Function} [options.onActivity] - Callback when toolbar activity detected
   * @param {Function} [options.onHide] - Callback when toolbar is hidden
   * @param {Function} [options.onHoverStart] - Callback when hovering starts
   * @param {Function} [options.onHoverEnd] - Callback when hovering ends
   */
  constructor(options = {}) {
    this._enabled = false;
    this._element = null;
    this._hovering = false;
    this._onActivity = options.onActivity || (() => {});
    this._onHide = options.onHide || (() => {});
    this._onHoverStart = options.onHoverStart || (() => {});
    this._onHoverEnd = options.onHoverEnd || (() => {});

    this._boundHandleMouseEnter = this._handleMouseEnter.bind(this);
    this._boundHandleMouseLeave = this._handleMouseLeave.bind(this);

    // Cached panel state to avoid repeated DOM queries
    this._panelOpenCache = false;
    this._panelCacheDirty = true;
    this._panelObserver = null;
  }

  /**
   * Check if toolbar auto-hide is enabled
   * @returns {boolean}
   */
  get isEnabled() {
    return this._enabled;
  }

  /**
   * Check if currently hovering over toolbar
   * @returns {boolean}
   */
  get isHovering() {
    return this._hovering;
  }

  /**
   * Enable toolbar auto-hide
   * @param {HTMLElement} element - The toolbar element
   */
  enable(element) {
    if (this._enabled) return;

    this._element = element;
    if (!this._element) return;

    this._enabled = true;
    this._hovering = false;
    this._panelCacheDirty = true;

    this._element.addEventListener('mouseenter', this._boundHandleMouseEnter);
    this._element.addEventListener('mouseleave', this._boundHandleMouseLeave);
    this._bindPanelObserver();

    this._onActivity();
  }

  /**
   * Disable toolbar auto-hide
   */
  disable() {
    if (!this._enabled) return;

    this._enabled = false;

    if (this._element) {
      this._element.removeEventListener('mouseenter', this._boundHandleMouseEnter);
      this._element.removeEventListener('mouseleave', this._boundHandleMouseLeave);
    }

    if (this._panelObserver) {
      try {
        this._panelObserver.disconnect();
      } catch {
        // MutationObserver may not be fully supported in test environments
      }
      this._panelObserver = null;
    }

    this.show();
    this._element = null;
    this._hovering = false;
    this._panelCacheDirty = true;
    this._panelOpenCache = false;
  }

  /**
   * Handle mouse enter on toolbar
   * @private
   */
  _handleMouseEnter() {
    this._hovering = true;
    this.show();
    this._onHoverStart();
  }

  /**
   * Handle mouse leave on toolbar
   * @private
   */
  _handleMouseLeave() {
    this._hovering = false;
    if (!this.isPanelOpen()) {
      this._onHoverEnd();
    }
  }

  /**
   * Hide the toolbar (if no panel is open)
   */
  hide() {
    if (this.isPanelOpen()) {
      return;
    }
    if (this._element) {
      this._element.classList.add(CSSClasses.TOOLBAR_HIDDEN);
      this._onHide();
    }
  }

  /**
   * Show the toolbar
   */
  show() {
    if (this._element) {
      this._element.classList.remove(CSSClasses.TOOLBAR_HIDDEN);
    }
  }

  /**
   * Check if any toolbar panel is currently open
   * Uses cached value when available to avoid repeated DOM queries
   * @returns {boolean}
   */
  isPanelOpen() {
    if (!this._element) return false;

    if (!this._panelCacheDirty) {
      return this._panelOpenCache;
    }

    const shaderPanel = this._element.querySelector('.shader-panel.visible');
    const openButton = this._element.querySelector('.panel-open');
    this._panelOpenCache = !!(shaderPanel || openButton);
    this._panelCacheDirty = false;

    return this._panelOpenCache;
  }

  /**
   * Invalidate the panel open state cache
   * Call this when panel visibility changes
   */
  invalidatePanelCache() {
    this._panelCacheDirty = true;
  }

  /**
   * Observe panel-related class changes to keep cache fresh
   * @private
   */
  _bindPanelObserver() {
    if (!this._element || typeof globalThis.MutationObserver === 'undefined') return;

    if (this._panelObserver) {
      this._panelObserver.disconnect();
    }

    this._panelObserver = new globalThis.MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
          continue;
        }

        const target = mutation.target instanceof Element ? mutation.target : null;
        if (!target) continue;

        const oldClassValue = mutation.oldValue || '';
        const panelOpenChanged =
          target.classList.contains(CSSClasses.PANEL_OPEN) ||
          oldClassValue.includes(CSSClasses.PANEL_OPEN);
        const shaderPanelChanged =
          (target.classList.contains('shader-panel') || oldClassValue.includes('shader-panel')) &&
          (target.classList.contains(CSSClasses.VISIBLE) || oldClassValue.includes(CSSClasses.VISIBLE));

        if (panelOpenChanged || shaderPanelChanged) {
          this._panelCacheDirty = true;
          break;
        }
      }
    });

    try {
      this._panelObserver.observe(this._element, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
        subtree: true
      });
    } catch {
      // MutationObserver may not be fully supported in test environments (Happy-DOM)
      // Fall back to always checking panel state on hide timer
      this._panelCacheDirty = true;
    }
  }

  /**
   * Dispose and cleanup resources
   */
  dispose() {
    this.disable();
  }
}
