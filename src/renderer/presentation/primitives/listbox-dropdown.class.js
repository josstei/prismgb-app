import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { DisclosureController } from './disclosure.class.js';
import { updateListboxActiveState } from './listbox.utils.js';

const COMBOBOX_DEBOUNCE_TIMEOUT = Symbol('comboboxDebounceTimeout');
const COMBOBOX_BLUR_TIMEOUT = Symbol('comboboxBlurTimeout');

class ListboxDropdownController {
  constructor({
    triggerElement,
    menuElement,
    labelElement,
    optionSelector = '[role="option"]',
    activeClass = CSSClasses.ACTIVE,
    ignoreOutsideSelectors = [],
    outsideEvent = 'click',
    closeOnEscape = true,
    closeOnClickOutside = true,
    onShow,
    onHide,
    enableTriggerKeyboard = false,
    focusOnTriggerOpen = false,
    onChange,
    logger
  }) {
    this.triggerElement = triggerElement;
    this.menuElement = menuElement;
    this.labelElement = labelElement;
    this.optionSelector = optionSelector;
    this.activeClass = activeClass;
    this.ignoreOutsideSelectors = ignoreOutsideSelectors;
    this.outsideEvent = outsideEvent;
    this.closeOnEscape = closeOnEscape;
    this.closeOnClickOutside = closeOnClickOutside;
    this.onShow = onShow;
    this.onHide = onHide;
    this.enableTriggerKeyboard = enableTriggerKeyboard;
    this.focusOnTriggerOpen = focusOnTriggerOpen;
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
      outsideEvent: this.outsideEvent,
      closeOnEscape: this.closeOnEscape,
      closeOnClickOutside: this.closeOnClickOutside,
      ignoreOutsideSelectors: this.ignoreOutsideSelectors,
      onShow: () => {
        this._syncInteractiveState({ isOpen: true });
        this.onShow?.();
      },
      onHide: () => {
        this._syncInteractiveState({ isOpen: false });
        this.onHide?.();
      },
      logger: this.logger
    });
    this._disclosure.initialize();

    this._domListeners.add(this.triggerElement, 'click', () => {
      this.toggleFromTrigger();
    });

    if (this.enableTriggerKeyboard) {
      this._domListeners.add(this.triggerElement, 'keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          this.toggleFromTrigger();
          return;
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          this.show();
          this.focusActiveOrFirstOption();
        }
      });
    }

    this._domListeners.add(this.menuElement, 'click', (event) => {
      const option = this._optionFromEvent(event);
      if (option) this._selectOption(option);
    });
    this._domListeners.add(this.menuElement, 'keydown', (event) => this._handleMenuKeydown(event));

    if (activeValue !== undefined) {
      this.setActive(activeValue);
    }

    this._syncInteractiveState({ isOpen: this.isOpen() });
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
      } else {
        const activeOption = this.menuElement.querySelector(`${this.optionSelector}.${this.activeClass}`);
        if (activeOption) {
          this.labelElement.textContent = activeOption.textContent || '';
        }
      }
    }

    this._syncInteractiveState({ isOpen: this.isOpen() });
  }

  show() { this._disclosure?.show(); }
  hide() { this._disclosure?.hide(); }
  toggle() { this._disclosure?.toggle(); }

  toggleFromTrigger() {
    const wasOpen = this.isOpen();
    this.toggle();
    if (!wasOpen && this.focusOnTriggerOpen) {
      this.focusActiveOrFirstOption();
    }
  }

  isOpen() { return this._disclosure?.isOpen() || false; }

  focusActiveOrFirstOption() {
    const activeOption = this.menuElement?.querySelector(`${this.optionSelector}.${this.activeClass}`);
    this._focusOption(activeOption || this._getOptions()[0]);
  }

  _getOptions() { return this.menuElement ? Array.from(this.menuElement.querySelectorAll(this.optionSelector)) : []; }

  _optionFromEvent(event) {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest(this.optionSelector) || null;
  }

  _focusOption(option) {
    if (!option) return;
    this._setRovingOption(this._getOptions(), option);
    option.focus?.();
  }

  _selectOption(option) {
    const value = option.dataset.value ?? '';
    const label = option.textContent || '';
    this.setActive(value, label);
    this.hide();
    this.triggerElement?.focus();
    this.onChange?.(value, label);
  }

  _handleMenuKeydown(event) {
    const options = this._getOptions();
    const current = this._optionFromEvent(event);
    if (options.length === 0) return;
    if (event.key === 'Enter' || event.key === ' ') {
      if (current) { event.preventDefault(); this._selectOption(current); }
      return;
    }
    if (event.key === 'Escape' && this.closeOnEscape) {
      event.preventDefault(); event.stopPropagation();
      this.hide(); this.triggerElement?.focus();
      return;
    }
    const currentIndex = current ? options.indexOf(current) : -1;
    const nextIndexByKey = {
      ArrowDown: Math.min(currentIndex + 1, options.length - 1),
      ArrowUp: currentIndex <= 0 ? 0 : currentIndex - 1,
      Home: 0,
      End: options.length - 1
    };
    if (!(event.key in nextIndexByKey)) return;
    event.preventDefault();
    this._focusOption(options[nextIndexByKey[event.key]]);
  }

  _syncInteractiveState({ isOpen }) {
    if (!this.menuElement) return;

    if (isOpen) {
      this.menuElement.setAttribute('aria-hidden', 'false');
      this.menuElement.removeAttribute('inert');
    } else {
      this.menuElement.setAttribute('aria-hidden', 'true');
      this.menuElement.setAttribute('inert', '');
    }

    const options = this._getOptions();
    if (options.length === 0) return;

    if (!isOpen) {
      this._setRovingOption(options, null);
      return;
    }

    const activeOption = this.menuElement.querySelector(`${this.optionSelector}.${this.activeClass}`);
    const focusedOption = options.find((option) => option === document.activeElement);
    const rovingOption = options.find((option) => option.tabIndex === 0);
    this._setRovingOption(options, focusedOption || activeOption || rovingOption || options[0]);
  }

  _setRovingOption(options, currentOption) {
    options.forEach((option) => {
      option.tabIndex = option === currentOption ? 0 : -1;
    });
  }

  dispose() {
    this.hide();
    this._domListeners.removeAll();
    this._disclosure?.dispose();
    this._disclosure = null;

    this.triggerElement = null;
    this.menuElement = null;
    this.labelElement = null;
    this.onShow = null;
    this.onHide = null;
    this.onChange = null;
    this.logger = null;
  }
}

class ComboboxListboxController extends PresentationComponent {
  constructor({
    logger,
    optionSelector = '[role="option"]',
    optionClassName = 'combobox-option',
    optionIdPrefix = 'combobox-option',
    highlightedClass = 'highlighted',
    visibleClass = CSSClasses.VISIBLE,
    listboxAriaLabel = 'Suggestions',
    debounceMs = 100,
    blurDelayMs = 150,
    getOptions = () => [],
    getOptionValue = (option) => String(option ?? ''),
    getOptionLabel = (option) => String(option ?? ''),
    onInput,
    onSelect,
    onEnter,
    onEscape,
    onBlur,
    onFocus
  } = {}) {
    super();
    Object.assign(this, {
      logger, optionSelector, optionClassName, optionIdPrefix, highlightedClass,
      visibleClass, listboxAriaLabel, debounceMs, blurDelayMs, getOptions,
      getOptionValue, getOptionLabel, onInput, onSelect, onEnter, onEscape,
      onBlur, onFocus, inputElement: null, listboxElement: null, highlightedIndex: -1
    });
  }

  initialize({ inputElement, listboxElement }) {
    this.inputElement = inputElement;
    this.listboxElement = listboxElement;
    if (!this.inputElement || !this.listboxElement) {
      this.logger?.warn('Combobox/listbox elements not found');
      return;
    }
    this._setListboxHidden(true);
    this.inputElement.setAttribute('role', 'combobox');
    this.inputElement.setAttribute('aria-autocomplete', 'list');
    this.inputElement.setAttribute('aria-expanded', 'false');
    if (this.listboxElement.id) this.inputElement.setAttribute('aria-controls', this.listboxElement.id);
    this.listen(this.inputElement, 'input', () => {
      this.replaceTimeout(COMBOBOX_DEBOUNCE_TIMEOUT, () => this.show(), this.debounceMs);
      this.onInput?.();
    });
    this.listen(this.inputElement, 'keydown', (event) => this._handleKeydown(event));
    this.listen(this.inputElement, 'blur', () => {
      this.replaceTimeout(COMBOBOX_BLUR_TIMEOUT, () => {
        this.hide();
        this.onBlur?.();
      }, this.blurDelayMs);
    });
    this.listen(this.inputElement, 'focus', () => {
      this.cancelManaged(COMBOBOX_BLUR_TIMEOUT);
      this.show();
      this.onFocus?.();
    });
    const handleSelection = (event) => {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      const optionElement = target?.closest(this.optionSelector);
      if (!optionElement || !this.isVisible()) return;
      event.preventDefault();
      this._selectOptionElement(optionElement);
    };
    this.listen(this.listboxElement, 'pointerdown', handleSelection);
    this.listen(this.listboxElement, 'click', handleSelection);
  }

  getValue() { return this.inputElement?.value || ''; }
  setValue(value) { if (this.inputElement) this.inputElement.value = value ?? ''; }
  isVisible() { return this.listboxElement?.classList.contains(this.visibleClass) || false; }
  getHighlightedIndex() { return this.highlightedIndex; }
  focus() { this.inputElement?.focus(); }
  select() { this.inputElement?.select(); }

  show() {
    if (!this.inputElement || !this.listboxElement) return;
    const options = this.getOptions?.(String(this.inputElement.value ?? '')) || [];
    if (!Array.isArray(options) || options.length === 0) {
      this.hide();
      return;
    }
    this.highlightedIndex = -1;
    this.listboxElement.innerHTML = '';
    this.listboxElement.setAttribute('role', 'listbox');
    if (this.listboxAriaLabel) this.listboxElement.setAttribute('aria-label', this.listboxAriaLabel);
    options.forEach((option, index) => {
      const optionElement = document.createElement('div');
      optionElement.className = this.optionClassName;
      optionElement.dataset.index = String(index);
      optionElement.dataset.value = this.getOptionValue(option);
      optionElement.id = `${this.optionIdPrefix}-${index}`;
      optionElement.setAttribute('role', 'option');
      optionElement.setAttribute('aria-selected', 'false');
      optionElement.textContent = this.getOptionLabel(option);
      this.listboxElement.appendChild(optionElement);
    });
    this.listboxElement.classList.add(this.visibleClass);
    this._setListboxHidden(false);
    this.inputElement.setAttribute('aria-expanded', 'true');
    this.inputElement.removeAttribute('aria-activedescendant');
  }

  hide() {
    this.cancelManaged(COMBOBOX_DEBOUNCE_TIMEOUT);
    this.listboxElement?.classList.remove(this.visibleClass);
    this._setListboxHidden(true);
    this.highlightedIndex = -1;
    this.inputElement?.setAttribute('aria-expanded', 'false');
    this.inputElement?.removeAttribute('aria-activedescendant');
  }

  _setListboxHidden(hidden) {
    if (!this.listboxElement) return;
    this.listboxElement.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (hidden) this.listboxElement.setAttribute('inert', '');
    else this.listboxElement.removeAttribute('inert');
  }

  _handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.isVisible() && this.highlightedIndex >= 0 ? this._getOptionElements()[this.highlightedIndex] : null;
      if (option) this._selectOptionElement(option);
      else this.onEnter?.();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      this.hide();
      this.onEscape?.();
      return;
    }
    const options = this._getOptionElements();
    if (!this.isVisible() || options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, options.length - 1);
      this._updateHighlight(options);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this._updateHighlight(options);
    }
  }

  _updateHighlight(options) {
    options.forEach((option, index) => {
      const active = index === this.highlightedIndex;
      option.classList.toggle(this.highlightedClass, active);
      option.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const activeOption = this.highlightedIndex >= 0 ? options[this.highlightedIndex] : null;
    if (activeOption) this.inputElement?.setAttribute('aria-activedescendant', activeOption.id);
    else this.inputElement?.removeAttribute('aria-activedescendant');
  }

  _selectOptionElement(optionElement) {
    const value = optionElement?.dataset?.value;
    if (typeof value !== 'string') return;
    this.setValue(value);
    this.hide();
    this.onSelect?.(value);
  }

  _getOptionElements() {
    return this.listboxElement ? Array.from(this.listboxElement.querySelectorAll(this.optionSelector)) : [];
  }

  dispose() {
    this.hide();
    super.dispose();
    Object.assign(this, {
      inputElement: null, listboxElement: null, getOptions: null, getOptionValue: null,
      getOptionLabel: null, onInput: null, onSelect: null, onEnter: null,
      onEscape: null, onBlur: null, onFocus: null, logger: null, highlightedIndex: -1
    });
  }
}

export { ListboxDropdownController, ComboboxListboxController };
