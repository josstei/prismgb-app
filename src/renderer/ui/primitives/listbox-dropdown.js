/**
 * Listbox Dropdown Controller
 *
 * Shared controller for listbox-style dropdowns with disclosure behavior.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { DisclosureController } from './disclosure.js';
import { updateListboxActiveState } from './listbox.js';

class ListboxDropdownController {
  constructor({
    triggerElement,
    menuElement,
    labelElement,
    optionSelector = '[role="option"]',
    activeClass = CSSClasses.ACTIVE,
    ignoreOutsideSelectors = [],
    onChange,
    logger
  }) {
    this.triggerElement = triggerElement;
    this.menuElement = menuElement;
    this.labelElement = labelElement;
    this.optionSelector = optionSelector;
    this.activeClass = activeClass;
    this.ignoreOutsideSelectors = ignoreOutsideSelectors;
    this.onChange = onChange;
    this.logger = logger;

    this._domListeners = createDomListenerManager({ logger });
    this._disclosure = null;
  }

  initialize({ activeValue = '' } = {}) {
    if (!this.triggerElement || !this.menuElement) {
      this.logger?.warn('Listbox dropdown elements not found');
      return;
    }

    this._disclosure = new DisclosureController({
      toggleElement: this.triggerElement,
      panelElement: this.menuElement,
      visibleClass: CSSClasses.VISIBLE,
      ignoreOutsideSelectors: this.ignoreOutsideSelectors,
      logger: this.logger
    });
    this._disclosure.initialize();

    this._domListeners.add(this.menuElement, 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const option = target?.closest(this.optionSelector);
      if (!option) return;

      const value = option.dataset.value ?? '';
      const label = option.textContent || '';
      this.setActive(value, label);
      this.onChange?.(value, label);
      this.hide();
    });

    if (activeValue !== undefined) {
      this.setActive(activeValue);
    }
  }

  setActive(value, labelOverride = '') {
    if (!this.menuElement) return;

    updateListboxActiveState({
      container: this.menuElement,
      optionSelector: this.optionSelector,
      activeValue: value,
      activeClass: this.activeClass
    });

    if (this.labelElement) {
      if (labelOverride) {
        this.labelElement.textContent = labelOverride;
        return;
      }

      const activeOption = this.menuElement.querySelector(`${this.optionSelector}.${this.activeClass}`);
      if (activeOption) {
        this.labelElement.textContent = activeOption.textContent || '';
      }
    }
  }

  show() {
    this._disclosure?.show();
  }

  hide() {
    this._disclosure?.hide();
  }

  toggle() {
    this._disclosure?.toggle();
  }

  dispose() {
    this._domListeners.removeAll();
    this._disclosure?.dispose();
    this._disclosure = null;

    this.triggerElement = null;
    this.menuElement = null;
    this.labelElement = null;
    this.onChange = null;
    this.logger = null;
  }
}

export { ListboxDropdownController };
