import { PresentationComponent } from '../lifecycle/presentation-component.base.js';
import type { LoggerLike } from '@prismgb/core';

const COMBOBOX_DEBOUNCE_TIMEOUT = Symbol('comboboxDebounceTimeout');
const COMBOBOX_BLUR_TIMEOUT = Symbol('comboboxBlurTimeout');

type ComboboxCallback = () => void;
type ComboboxSelectCallback = (value: string) => void;

export interface ComboboxListboxControllerOptions<TOption = unknown> {
  logger?: LoggerLike | null;
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

export class ComboboxListboxController<TOption = unknown> extends PresentationComponent {
  declare logger: LoggerLike | null | undefined;
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
      visibleClass = 'visible',
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

  override dispose(): void | Promise<void> {
    this.hide();
    const disposed = super.dispose();
    Object.assign(this, {
      inputElement: null, listboxElement: null, getOptions: null, getOptionValue: null,
      getOptionLabel: null, onInput: null, onSelect: null, onEnter: null,
      onEscape: null, onBlur: null, onFocus: null, logger: null, highlightedIndex: -1
    });
    return disposed;
  }
}
