/**
 * DisclosureController
 *
 * Shared show/hide logic for dropdowns and panels with
 * escape key and click-outside handling.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config.ts';

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
    if (this.toggleOpenClass && this.toggleElement) {
      this.toggleElement.classList.remove(this.toggleOpenClass);
    }
    if (this.ariaExpandedElement) {
      this.ariaExpandedElement.setAttribute('aria-expanded', 'false');
    }

    this._isOpen = false;
    this.onHide?.();
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

export { DisclosureController };
