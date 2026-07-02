/**
 * DisclosureController
 *
 * Shared show/hide logic for dropdowns and panels with
 * escape key and click-outside handling.
 */

import { PresentationComponent } from '../lifecycle/presentation-component.base.js';
import type { LoggerLike } from '@platform/core';

export interface AnchoredLayoutSizeDefaults {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface AnchoredRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface CalculateAnchoredDisclosureLayoutOptions {
  anchorRect?: AnchoredRect | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  rightOffset?: number | null;
  sizeDefaults?: Partial<AnchoredLayoutSizeDefaults> | null;
  gap?: number | null;
  safeEdge?: number | null;
  minFittableHeight?: number | null;
  minDockedVisibleHeight?: number | null;
}

export interface AnchoredDisclosureLayout {
  placement: 'below' | 'right';
  left: number;
  top: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

type DisclosureCallback = () => void;
export interface DisclosureControllerOptions {
  toggleElement: HTMLElement | null;
  panelElement: HTMLElement | null;
  logger?: LoggerLike | null;
  visibleClass?: string;
  toggleOpenClass?: string | null;
  ariaExpandedElement?: HTMLElement | null;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
  outsideEvent?: string;
  ignoreOutsideElements?: readonly (Element | null | undefined)[];
  ignoreOutsideSelectors?: readonly string[];
  onShow?: DisclosureCallback | null;
  onHide?: DisclosureCallback | null;
}

export interface DisclosureControllerInitializeOptions {
  isOpen?: boolean;
}

const DEFAULT_ANCHORED_LAYOUT_SIZES: Readonly<AnchoredLayoutSizeDefaults> = Object.freeze({
  minWidth: 200,
  maxWidth: 450,
  minHeight: 300,
  maxHeight: 600
});
const DISCLOSURE_LISTENER_LIFECYCLE = Symbol('disclosureListenerLifecycle');

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeAnchoredLayoutSizes(
  sizeDefaults: Partial<AnchoredLayoutSizeDefaults> | null | undefined
): AnchoredLayoutSizeDefaults {
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
}: CalculateAnchoredDisclosureLayoutOptions = {}): AnchoredDisclosureLayout {
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

class DisclosureController extends PresentationComponent {
  declare toggleElement: HTMLElement | null;
  declare panelElement: HTMLElement | null;
  declare visibleClass: string;
  declare toggleOpenClass: string | null;
  declare ariaExpandedElement: HTMLElement | null;
  declare closeOnEscape: boolean;
  declare closeOnClickOutside: boolean;
  declare outsideEvent: string;
  declare ignoreOutsideElements: readonly (Element | null | undefined)[];
  declare ignoreOutsideSelectors: readonly string[];
  declare onShow: DisclosureCallback | null | undefined;
  declare onHide: DisclosureCallback | null | undefined;
  declare private _isOpen: boolean;

  constructor({
    toggleElement,
    panelElement,
    visibleClass = 'visible',
    toggleOpenClass = null,
    ariaExpandedElement = null,
    closeOnEscape = true,
    closeOnClickOutside = true,
    outsideEvent = 'click',
    ignoreOutsideElements = [],
    ignoreOutsideSelectors = [],
    onShow,
    onHide
  }: DisclosureControllerOptions) {
    super();

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
  }

  initialize({ isOpen = false }: DisclosureControllerInitializeOptions = {}): void {
    this.cancelManaged(DISCLOSURE_LISTENER_LIFECYCLE);
    this._bindGlobalListeners();

    if (isOpen) {
      this._applyOpenState();
    } else {
      this._applyClosedState();
    }
  }

  isOpen(): boolean {
    return this._isOpen;
  }

  toggle(): void {
    if (this._isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    if (!this.panelElement || this._isOpen) return;

    this._applyOpenState();
    this.onShow?.();
  }

  hide(): void {
    if (!this.panelElement || !this._isOpen) return;

    this._applyClosedState();
    this.onHide?.();
  }

  private _applyOpenState(): void {
    if (!this.panelElement) return;

    this.panelElement.classList.add(this.visibleClass);
    this._setPanelHidden(false);
    if (this.toggleOpenClass && this.toggleElement) {
      this.toggleElement.classList.add(this.toggleOpenClass);
    }
    if (this.ariaExpandedElement) {
      this.ariaExpandedElement.setAttribute('aria-expanded', 'true');
    }
    this._isOpen = true;
  }

  private _applyClosedState(): void {
    if (this.panelElement) {
      this.panelElement.classList.remove(this.visibleClass);
    }
    this._setPanelHidden(true);
    if (this.toggleOpenClass && this.toggleElement) {
      this.toggleElement.classList.remove(this.toggleOpenClass);
    }
    if (this.ariaExpandedElement) {
      this.ariaExpandedElement.setAttribute('aria-expanded', 'false');
    }
    this._isOpen = false;
  }

  private _setPanelHidden(hidden: boolean): void {
    if (!this.panelElement) return;
    this.panelElement.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (hidden) this.panelElement.setAttribute('inert', '');
    else this.panelElement.removeAttribute('inert');
  }

  override dispose(): void | Promise<void> {
    this._applyClosedState();
    const disposed = super.dispose();
    this.toggleElement = null;
    this.panelElement = null;
    this.ariaExpandedElement = null;
    this.ignoreOutsideElements = [];
    this.ignoreOutsideSelectors = [];
    return disposed;
  }

  private _bindGlobalListeners(): void {
    const disposers: Array<() => void> = [];

    if (this.closeOnEscape) {
      disposers.push(this.listen(document, 'keydown', (event) => {
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === 'Escape' && this._isOpen) {
          this.hide();
        }
      }));
    }

    if (this.closeOnClickOutside) {
      disposers.push(this.listen(document, this.outsideEvent, (event) => {
        if (!this._isOpen) return;

        const target = event.target instanceof Element ? event.target : null;
        if (!target) return;

        if (this._isInsideIgnoredTarget(target)) {
          return;
        }

        this.hide();
      }));
    }

    if (disposers.length > 0) {
      this.replaceManagedGroup(DISCLOSURE_LISTENER_LIFECYCLE, disposers);
    }
  }

  private _isInsideIgnoredTarget(target: Element): boolean {
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
