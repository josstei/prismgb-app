import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import type { Logger } from '@platform/core';

type DisclosureCallback = () => void;
export interface DisclosureControllerOptions {
  toggleElement: HTMLElement | null;
  panelElement: HTMLElement | null;
  logger?: Logger | null;
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

const DISCLOSURE_LISTENER_LIFECYCLE = Symbol('disclosureListenerLifecycle');

const DISCLOSURE_DEFAULTS: Partial<DisclosureControllerOptions> = {
  visibleClass: 'visible',
  toggleOpenClass: null,
  closeOnEscape: true,
  closeOnClickOutside: true,
  outsideEvent: 'click',
  ignoreOutsideElements: [],
  ignoreOutsideSelectors: []
};

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

  constructor(options: DisclosureControllerOptions) {
    super();

    this.applyOptions<DisclosureControllerOptions>(DISCLOSURE_DEFAULTS, options);
    this.ariaExpandedElement = options.ariaExpandedElement || this.toggleElement;

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
  DisclosureController
};
