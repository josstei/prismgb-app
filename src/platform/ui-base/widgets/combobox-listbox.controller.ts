import { PresentationComponent } from '../lifecycle/presentation-component.base.js';
import type { LoggerLike } from '@platform/core';

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
  logger: LoggerLike | null | undefined;
  optionSelector: string;
  optionClassName: string;
  optionIdPrefix: string;
  highlightedClass: string;
  visibleClass: string;
  listboxAriaLabel: string;
  debounceMs: number;
  blurDelayMs: number;
  getOptions: ((value: string) => readonly TOption[]) | null;
  getOptionValue: ((option: TOption) => string) | null;
  getOptionLabel: ((option: TOption) => string) | null;
  onInput: ComboboxCallback | null | undefined;
  onSelect: ComboboxSelectCallback | null | undefined;
  onEnter: ComboboxCallback | null | undefined;
  onEscape: ComboboxCallback | null | undefined;
  onBlur: ComboboxCallback | null | undefined;
  onFocus: ComboboxCallback | null | undefined;
  inputElement: HTMLInputElement | null;
  listboxElement: HTMLElement | null;
  highlightedIndex: number;

  constructor(options: ComboboxListboxControllerOptions<TOption> = {}) {
    super();
    this.logger = options.logger;
    this.optionSelector = options.optionSelector ?? '[role="option"]';
    this.optionClassName = options.optionClassName ?? 'combobox-option';
    this.optionIdPrefix = options.optionIdPrefix ?? 'combobox-option';
    this.highlightedClass = options.highlightedClass ?? 'highlighted';
    this.visibleClass = options.visibleClass ?? 'visible';
    this.listboxAriaLabel = options.listboxAriaLabel ?? 'Suggestions';
    this.debounceMs = options.debounceMs ?? 100;
    this.blurDelayMs = options.blurDelayMs ?? 150;
    this.getOptions = options.getOptions ?? (() => []);
    this.getOptionValue = options.getOptionValue ?? ((option) => String(option ?? ''));
    this.getOptionLabel = options.getOptionLabel ?? ((option) => String(option ?? ''));
    this.onInput = options.onInput;
    this.onSelect = options.onSelect;
    this.onEnter = options.onEnter;
    this.onEscape = options.onEscape;
    this.onBlur = options.onBlur;
    this.onFocus = options.onFocus;
    this.inputElement = null;
    this.listboxElement = null;
    this.highlightedIndex = -1;
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

  setValue(value: string | null | undefined): void { if (this.inputElement) this.inputElement.value = value ?? ''; }
  isVisible(): boolean { return this.listboxElement?.classList.contains(this.visibleClass) || false; }

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
