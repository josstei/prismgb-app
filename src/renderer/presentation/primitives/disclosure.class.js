/**
 * DisclosureController
 *
 * Shared show/hide logic for dropdowns and panels with
 * escape key and click-outside handling.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';

const DEFAULT_ANCHORED_LAYOUT_SIZES = Object.freeze({
  minWidth: 200,
  maxWidth: 450,
  minHeight: 300,
  maxHeight: 600
});

function toFiniteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAnchoredLayoutSizes(sizeDefaults) {
  return {
    minWidth: toFiniteNumber(sizeDefaults?.minWidth, DEFAULT_ANCHORED_LAYOUT_SIZES.minWidth),
    maxWidth: toFiniteNumber(sizeDefaults?.maxWidth, DEFAULT_ANCHORED_LAYOUT_SIZES.maxWidth),
    minHeight: toFiniteNumber(sizeDefaults?.minHeight, DEFAULT_ANCHORED_LAYOUT_SIZES.minHeight),
    maxHeight: toFiniteNumber(sizeDefaults?.maxHeight, DEFAULT_ANCHORED_LAYOUT_SIZES.maxHeight)
  };
}

/**
 * Headless anchored panel layout calculator for disclosure/popover surfaces.
 * Returns clamped panel coordinates and size bounds for right-of-anchor
 * placement with a dock-below fallback when width is constrained.
 */
function calculateAnchoredDisclosureLayout({
  anchorRect,
  viewportWidth,
  viewportHeight,
  rightOffset = 0,
  sizeDefaults = DEFAULT_ANCHORED_LAYOUT_SIZES,
  gap = 16,
  safeEdge = 8,
  minFittableHeight = 200,
  minDockedVisibleHeight = 120
} = {}) {
  const anchor = anchorRect || { left: 0, top: 0, right: 0, bottom: 0 };
  const defaults = normalizeAnchoredLayoutSizes(sizeDefaults);
  const resolvedViewportWidth = Math.max(0, toFiniteNumber(viewportWidth, 0));
  const resolvedViewportHeight = Math.max(0, toFiniteNumber(viewportHeight, 0));
  const resolvedRightOffset = Math.max(0, toFiniteNumber(rightOffset, 0));
  const resolvedGap = Math.max(0, toFiniteNumber(gap, 16));
  const resolvedSafeEdge = Math.max(0, toFiniteNumber(safeEdge, 8));

  const desiredLeft = Math.round(anchor.right + resolvedGap);
  const availableWidth = resolvedViewportWidth - resolvedRightOffset - resolvedSafeEdge - desiredLeft;

  let minWidth = defaults.minWidth;
  let maxWidth = defaults.maxWidth;
  const shouldDockBelow = availableWidth < defaults.minWidth;

  if (availableWidth > 0 && !shouldDockBelow) {
    minWidth = Math.min(minWidth, availableWidth);
    maxWidth = Math.min(maxWidth, availableWidth);
  } else if (shouldDockBelow) {
    const fallbackWidth = Math.max(1, resolvedViewportWidth - resolvedRightOffset - resolvedSafeEdge * 2);
    maxWidth = Math.min(maxWidth, fallbackWidth);
    minWidth = Math.min(minWidth, maxWidth);
  }

  const maxFittableHeight = Math.max(
    Math.max(0, toFiniteNumber(minFittableHeight, 200)),
    resolvedViewportHeight - resolvedSafeEdge * 2
  );
  let minHeight = Math.min(defaults.minHeight, maxFittableHeight);
  let maxHeight = defaults.maxHeight;

  const maxLeft = Math.max(resolvedSafeEdge, resolvedViewportWidth - resolvedRightOffset - minWidth);
  const left = shouldDockBelow
    ? clamp(Math.round(anchor.left), resolvedSafeEdge, maxLeft)
    : clamp(desiredLeft, resolvedSafeEdge, maxLeft);

  const desiredTop = shouldDockBelow
    ? Math.round(anchor.bottom + resolvedGap)
    : Math.round(anchor.top);

  if (shouldDockBelow) {
    const availableHeightBelow = Math.max(
      Math.max(0, toFiniteNumber(minDockedVisibleHeight, 120)),
      resolvedViewportHeight - desiredTop - resolvedSafeEdge
    );
    maxHeight = Math.min(maxHeight, availableHeightBelow);
    minHeight = Math.min(minHeight, maxHeight);
  }

  const maxTop = Math.max(resolvedSafeEdge, resolvedViewportHeight - minHeight - resolvedSafeEdge);
  const top = clamp(desiredTop, resolvedSafeEdge, maxTop);

  return {
    placement: shouldDockBelow ? 'below' : 'right',
    left,
    top,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight
  };
}

class DisclosureController {
  constructor({
    toggleElement,
    panelElement,
    logger,
    visibleClass = CSSClasses.VISIBLE,
    toggleOpenClass = null,
    ariaExpandedElement = null,
    closeOnEscape = true,
    closeOnClickOutside = true,
    outsideEvent = 'click',
    ignoreOutsideElements = [],
    ignoreOutsideSelectors = [],
    onShow,
    onHide
  }) {
    this.toggleElement = toggleElement;
    this.panelElement = panelElement;
    this.visibleClass = visibleClass;
    this.toggleOpenClass = toggleOpenClass;
    this.ariaExpandedElement = ariaExpandedElement || toggleElement;
    this.closeOnEscape = closeOnEscape;
    this.closeOnClickOutside = closeOnClickOutside;
    this.outsideEvent = outsideEvent;
    this.ignoreOutsideElements = ignoreOutsideElements;
    this.ignoreOutsideSelectors = ignoreOutsideSelectors;
    this.onShow = onShow;
    this.onHide = onHide;

    this._isOpen = false;
    this._domListeners = createDomListenerManager({ logger });
  }

  initialize({ isOpen = false } = {}) {
    this._bindGlobalListeners();

    if (isOpen) {
      this.show();
    } else {
      this._setPanelHidden(true);
    }
  }

  isOpen() {
    return this._isOpen;
  }

  toggle() {
    if (this._isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    if (!this.panelElement || this._isOpen) return;

    this.panelElement.classList.add(this.visibleClass);
    this._setPanelHidden(false);
    if (this.toggleOpenClass && this.toggleElement) {
      this.toggleElement.classList.add(this.toggleOpenClass);
    }
    if (this.ariaExpandedElement) {
      this.ariaExpandedElement.setAttribute('aria-expanded', 'true');
    }

    this._isOpen = true;
    this.onShow?.();
  }

  hide() {
    if (!this.panelElement || !this._isOpen) return;

    this.panelElement.classList.remove(this.visibleClass);
    this._setPanelHidden(true);
    if (this.toggleOpenClass && this.toggleElement) {
      this.toggleElement.classList.remove(this.toggleOpenClass);
    }
    if (this.ariaExpandedElement) {
      this.ariaExpandedElement.setAttribute('aria-expanded', 'false');
    }

    this._isOpen = false;
    this.onHide?.();
  }

  _setPanelHidden(hidden) {
    if (!this.panelElement) return;
    this.panelElement.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (hidden) this.panelElement.setAttribute('inert', '');
    else this.panelElement.removeAttribute('inert');
  }

  dispose() {
    this._domListeners.removeAll();
    this.toggleElement = null;
    this.panelElement = null;
    this.ariaExpandedElement = null;
    this.ignoreOutsideElements = [];
    this.ignoreOutsideSelectors = [];
  }

  _bindGlobalListeners() {
    if (this.closeOnEscape) {
      this._domListeners.add(document, 'keydown', (event) => {
        if (event.key === 'Escape' && this._isOpen) {
          this.hide();
        }
      });
    }

    if (this.closeOnClickOutside) {
      this._domListeners.add(document, this.outsideEvent, (event) => {
        if (!this._isOpen) return;

        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (this._isInsideIgnoredTarget(target)) {
          return;
        }

        this.hide();
      });
    }
  }

  _isInsideIgnoredTarget(target) {
    if (this.panelElement && this.panelElement.contains(target)) {
      return true;
    }

    if (this.toggleElement && this.toggleElement.contains(target)) {
      return true;
    }

    if (this.ignoreOutsideElements.some((element) => element?.contains(target))) {
      return true;
    }

    if (this.ignoreOutsideSelectors.length > 0) {
      return this.ignoreOutsideSelectors.some((selector) => target.closest(selector));
    }

    return false;
  }
}

export {
  DisclosureController,
  calculateAnchoredDisclosureLayout
};
