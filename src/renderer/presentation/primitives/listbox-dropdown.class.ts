import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { DisclosureController } from './disclosure.class.js';
import { updateListboxActiveState } from './listbox.utils.js';

const LISTBOX_DROPDOWN_RUNTIME_LIFECYCLE = Symbol('listboxDropdownRuntimeLifecycle');

type ListboxDropdownCallback = () => void;
type ListboxDropdownChangeCallback = (value: string, label: string) => void;
type PresentationPrimitiveLogger = {
  warn(message: string, ...args: unknown[]): void;
};

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
  logger?: PresentationPrimitiveLogger | null;
}

export interface ListboxDropdownInitializeOptions {
  activeValue?: string;
}



class ListboxDropdownController extends PresentationComponent {
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
  declare logger: PresentationPrimitiveLogger | null | undefined;
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
    super();

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

    this._disclosure = null;
  }

  initialize({ activeValue = '' }: ListboxDropdownInitializeOptions = {}): void {
    void this._releaseRuntimeLifecycle();

    if (!this.triggerElement || !this.menuElement) {
      this.logger?.warn('Listbox dropdown elements not found');
      return;
    }

    const disclosure = new DisclosureController({
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
    this._disclosure = disclosure;
    disclosure.initialize();

    const listenerDisposers: Array<() => void> = [];

    listenerDisposers.push(this.listen(this.triggerElement, 'click', () => {
      this.toggleFromTrigger();
    }));

    if (this.enableTriggerKeyboard) {
      listenerDisposers.push(this.listen(this.triggerElement, 'keydown', (event) => {
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
      }));
    }

    listenerDisposers.push(this.listen(this.menuElement, 'click', (event) => {
      const option = this._optionFromEvent(event);
      if (option) this._selectOption(option);
    }));
    listenerDisposers.push(this.listen(this.menuElement, 'keydown', (event) => this._handleMenuKeydown(event as KeyboardEvent)));

    this.replaceManaged(LISTBOX_DROPDOWN_RUNTIME_LIFECYCLE, async () => {
      listenerDisposers.splice(0).reverse().forEach((dispose) => dispose());
      await disclosure.dispose();
      if (this._disclosure === disclosure) {
        this._disclosure = null;
      }
    });

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

  private _releaseRuntimeLifecycle(): void | Promise<void> {
    this.hide();
    return this.cancelManaged(LISTBOX_DROPDOWN_RUNTIME_LIFECYCLE);
  }

  override async dispose(): Promise<void> {
    await this._releaseRuntimeLifecycle();
    await super.dispose();

    this.triggerElement = null;
    this.menuElement = null;
    this.labelElement = null;
    this.onShow = null;
    this.onHide = null;
    this.onChange = null;
    this.logger = null;
  }
}

export { ListboxDropdownController };

