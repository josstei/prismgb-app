import {
  createDomListenerManager,
  type DomListenerLogger,
  type DomListenerManager
} from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { DisclosureController } from './disclosure.class.js';
import { updateListboxActiveState } from './listbox.utils.js';

const COMBOBOX_DEBOUNCE_TIMEOUT = Symbol('comboboxDebounceTimeout');
const COMBOBOX_BLUR_TIMEOUT = Symbol('comboboxBlurTimeout');

type ListboxDropdownCallback = () => void;
type ListboxDropdownChangeCallback = (value: string, label: string) => void;

export interface ListboxDropdownControllerOptions {
  triggerElement: HTMLElement | null;
  menuElement: HTMLElement | null;
  labelElement?: HTMLElement | null;
  optionSelector?: string;
  activeClass?: string;
  ignoreOutsideSelectors?: readonly string[];
  outsideEvent?: string;
  closeOnEscape?: boolean;
  closeOnClickOutside?: boolean;
  onShow?: ListboxDropdownCallback | null;
  onHide?: ListboxDropdownCallback | null;
  enableTriggerKeyboard?: boolean;
  focusOnTriggerOpen?: boolean;
  onChange?: ListboxDropdownChangeCallback | null;
  logger?: DomListenerLogger | null;
}

export interface ListboxDropdownInitializeOptions {
  activeValue?: string;
}

type ComboboxCallback = () => void;
type ComboboxSelectCallback = (value: string) => void;

export interface ComboboxListboxControllerOptions<TOption = unknown> {
  logger?: DomListenerLogger | null;
  optionSelector?: string;
  optionClassName?: string;
  optionIdPrefix?: string;
  highlightedClass?: string;
  visibleClass?: string;
  listboxAriaLabel?: string;
  debounceMs?: number;
  blurDelayMs?: number;
  getOptions?: (value: string) => readonly TOption[];
  getOptionValue?: (option: TOption) => string;
  getOptionLabel?: (option: TOption) => string;
  onInput?: ComboboxCallback | null;
  onSelect?: ComboboxSelectCallback | null;
  onEnter?: ComboboxCallback | null;
  onEscape?: ComboboxCallback | null;
  onBlur?: ComboboxCallback | null;
  onFocus?: ComboboxCallback | null;
}

export interface ComboboxListboxInitializeOptions {
  inputElement: HTMLInputElement | null;
  listboxElement: HTMLElement | null;
}

class ListboxDropdownController {
  declare triggerElement: HTMLElement | null;
  declare menuElement: HTMLElement | null;
  declare labelElement: HTMLElement | null | undefined;
  declare optionSelector: string;
  declare activeClass: string;
  declare ignoreOutsideSelectors: readonly string[];
  declare outsideEvent: string;
  declare closeOnEscape: boolean;
  declare closeOnClickOutside: boolean;
  declare onShow: ListboxDropdownCallback | null | undefined;
  declare onHide: ListboxDropdownCallback | null | undefined;
  declare enableTriggerKeyboard: boolean;
  declare focusOnTriggerOpen: boolean;
  declare onChange: ListboxDropdownChangeCallback | null | undefined;
  declare logger: DomListenerLogger | null | undefined;
  declare private _domListeners: DomListenerManager;
  declare private _disclosure: DisclosureController | null;

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
  }: ListboxDropdownControllerOptions) {
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

    this._domListeners = createDomListenerManager({ logger: logger ?? undefined });
    this._disclosure = null;
  }

  initialize({ activeValue = '' }: ListboxDropdownInitializeOptions = {}): void {
    this._releaseRuntimeLifecycle();

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
        const keyboardEvent = event as KeyboardEvent;
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          this.toggleFromTrigger();
          return;
        }

        if (keyboardEvent.key === 'ArrowDown') {
          keyboardEvent.preventDefault();
          this.show();
          this.focusActiveOrFirstOption();
        }
      });
    }

    this._domListeners.add(this.menuElement, 'click', (event) => {
      const option = this._optionFromEvent(event);
      if (option) this._selectOption(option);
    });
    this._domListeners.add(this.menuElement, 'keydown', (event) => this._handleMenuKeydown(event as KeyboardEvent));

    if (activeValue !== undefined) {
      this.setActive(activeValue);
    }

    this._syncInteractiveState({ isOpen: this.isOpen() });
  }

  setActive(value: string | null | undefined, labelOverride = ''): void {
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

  show(): void { this._disclosure?.show(); }
  hide(): void { this._disclosure?.hide(); }
  toggle(): void { this._disclosure?.toggle(); }

  toggleFromTrigger(): void {
    const wasOpen = this.isOpen();
    this.toggle();
    if (!wasOpen && this.focusOnTriggerOpen) {
      this.focusActiveOrFirstOption();
    }
  }

  isOpen(): boolean { return this._disclosure?.isOpen() || false; }

  focusActiveOrFirstOption(): void {
    const activeOption = this.menuElement?.querySelector<HTMLElement>(`${this.optionSelector}.${this.activeClass}`);
    this._focusOption(activeOption || this._getOptions()[0]);
  }

  private _getOptions(): HTMLElement[] {
    return this.menuElement ? Array.from(this.menuElement.querySelectorAll<HTMLElement>(this.optionSelector)) : [];
  }

  private _optionFromEvent(event: Event): HTMLElement | null {
    const target = event.target instanceof Element ? event.target : null;
    return target?.closest<HTMLElement>(this.optionSelector) || null;
  }

  private _focusOption(option: HTMLElement | null | undefined): void {
    if (!option) return;
    this._setRovingOption(this._getOptions(), option);
    option.focus?.();
  }

  private _selectOption(option: HTMLElement): void {
    const value = option.dataset.value ?? '';
    const label = option.textContent || '';
    this.setActive(value, label);
    this.hide();
    this.triggerElement?.focus();
    this.onChange?.(value, label);
  }

  private _handleMenuKeydown(event: KeyboardEvent): void {
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
    const nextIndexByKey: Partial<Record<string, number>> = {
      ArrowDown: Math.min(currentIndex + 1, options.length - 1),
      ArrowUp: currentIndex <= 0 ? 0 : currentIndex - 1,
      Home: 0,
      End: options.length - 1
    };
    if (!(event.key in nextIndexByKey)) return;
    event.preventDefault();
    this._focusOption(options[nextIndexByKey[event.key] as number]);
  }

  private _syncInteractiveState({ isOpen }: { isOpen: boolean }): void {
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

    const activeOption = this.menuElement.querySelector<HTMLElement>(`${this.optionSelector}.${this.activeClass}`);
    const focusedOption = options.find((option) => option === document.activeElement);
    const rovingOption = options.find((option) => option.tabIndex === 0);
    this._setRovingOption(options, focusedOption || activeOption || rovingOption || options[0]);
  }

  private _setRovingOption(options: HTMLElement[], currentOption: HTMLElement | null | undefined): void {
    options.forEach((option) => {
      option.tabIndex = option === currentOption ? 0 : -1;
    });
  }

  private _releaseRuntimeLifecycle(): void {
    this.hide();
    this._domListeners.removeAll();
    this._disclosure?.dispose();
    this._disclosure = null;
  }

  dispose(): void {
    this._releaseRuntimeLifecycle();

    this.triggerElement = null;
    this.menuElement = null;
    this.labelElement = null;
    this.onShow = null;
    this.onHide = null;
    this.onChange = null;
    this.logger = null;
  }
}

class ComboboxListboxController<TOption = unknown> extends PresentationComponent {
  declare logger: DomListenerLogger | null | undefined;
  declare optionSelector: string;
  declare optionClassName: string;
  declare optionIdPrefix: string;
  declare highlightedClass: string;
  declare visibleClass: string;
  declare listboxAriaLabel: string;
  declare debounceMs: number;
  declare blurDelayMs: number;
  declare getOptions: ((value: string) => readonly TOption[]) | null;
  declare getOptionValue: ((option: TOption) => string) | null;
  declare getOptionLabel: ((option: TOption) => string) | null;
  declare onInput: ComboboxCallback | null | undefined;
  declare onSelect: ComboboxSelectCallback | null | undefined;
  declare onEnter: ComboboxCallback | null | undefined;
  declare onEscape: ComboboxCallback | null | undefined;
  declare onBlur: ComboboxCallback | null | undefined;
  declare onFocus: ComboboxCallback | null | undefined;
  declare inputElement: HTMLInputElement | null;
  declare listboxElement: HTMLElement | null;
  declare highlightedIndex: number;

  constructor(options: ComboboxListboxControllerOptions<TOption> = {}) {
    const {
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
      getOptionValue = (option: TOption) => String(option ?? ''),
      getOptionLabel = (option: TOption) => String(option ?? ''),
      onInput,
      onSelect,
      onEnter,
      onEscape,
      onBlur,
      onFocus
    } = options;
    super();
    Object.assign(this, {
      logger, optionSelector, optionClassName, optionIdPrefix, highlightedClass,
      visibleClass, listboxAriaLabel, debounceMs, blurDelayMs, getOptions,
      getOptionValue, getOptionLabel, onInput, onSelect, onEnter, onEscape,
      onBlur, onFocus, inputElement: null, listboxElement: null, highlightedIndex: -1
    });
  }

  initialize({ inputElement, listboxElement }: ComboboxListboxInitializeOptions): void {
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
    this.listen(this.inputElement, 'keydown', (event) => this._handleKeydown(event as KeyboardEvent));
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
    const handleSelection = (event: Event): void => {
      const eventTarget = event.target as (EventTarget & { parentElement?: Element | null }) | null;
      const target = eventTarget instanceof Element ? eventTarget : eventTarget?.parentElement;
      const optionElement = target?.closest<HTMLElement>(this.optionSelector);
      if (!optionElement || !this.isVisible()) return;
      event.preventDefault();
      this._selectOptionElement(optionElement);
    };
    this.listen(this.listboxElement, 'pointerdown', handleSelection);
    this.listen(this.listboxElement, 'click', handleSelection);
  }

  getValue(): string { return this.inputElement?.value || ''; }
  setValue(value: string | null | undefined): void { if (this.inputElement) this.inputElement.value = value ?? ''; }
  isVisible(): boolean { return this.listboxElement?.classList.contains(this.visibleClass) || false; }
  getHighlightedIndex(): number { return this.highlightedIndex; }
  focus(): void { this.inputElement?.focus(); }
  select(): void { this.inputElement?.select(); }

  show(): void {
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
      optionElement.dataset.value = this.getOptionValue!(option);
      optionElement.id = `${this.optionIdPrefix}-${index}`;
      optionElement.setAttribute('role', 'option');
      optionElement.setAttribute('aria-selected', 'false');
      optionElement.textContent = this.getOptionLabel!(option);
      this.listboxElement!.appendChild(optionElement);
    });
    this.listboxElement.classList.add(this.visibleClass);
    this._setListboxHidden(false);
    this.inputElement.setAttribute('aria-expanded', 'true');
    this.inputElement.removeAttribute('aria-activedescendant');
  }

  hide(): void {
    this.cancelManaged(COMBOBOX_DEBOUNCE_TIMEOUT);
    this.listboxElement?.classList.remove(this.visibleClass);
    this._setListboxHidden(true);
    this.highlightedIndex = -1;
    this.inputElement?.setAttribute('aria-expanded', 'false');
    this.inputElement?.removeAttribute('aria-activedescendant');
  }

  private _setListboxHidden(hidden: boolean): void {
    if (!this.listboxElement) return;
    this.listboxElement.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (hidden) this.listboxElement.setAttribute('inert', '');
    else this.listboxElement.removeAttribute('inert');
  }

  private _handleKeydown(event: KeyboardEvent): void {
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

  private _updateHighlight(options: HTMLElement[]): void {
    options.forEach((option, index) => {
      const active = index === this.highlightedIndex;
      option.classList.toggle(this.highlightedClass, active);
      option.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    const activeOption = this.highlightedIndex >= 0 ? options[this.highlightedIndex] : null;
    if (activeOption) this.inputElement?.setAttribute('aria-activedescendant', activeOption.id);
    else this.inputElement?.removeAttribute('aria-activedescendant');
  }

  private _selectOptionElement(optionElement: HTMLElement | null | undefined): void {
    const value = optionElement?.dataset?.value;
    if (typeof value !== 'string') return;
    this.setValue(value);
    this.hide();
    this.onSelect?.(value);
  }

  private _getOptionElements(): HTMLElement[] {
    return this.listboxElement ? Array.from(this.listboxElement.querySelectorAll<HTMLElement>(this.optionSelector)) : [];
  }

  override dispose(): void {
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
