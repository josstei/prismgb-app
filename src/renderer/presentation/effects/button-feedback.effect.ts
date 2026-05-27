import { TIMING } from '@renderer/presentation/config/constants.config';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import type { DomBindingsFlat } from '@renderer/presentation/primitives/dom-bindings.utils.js';

type ButtonElements = DomBindingsFlat;

type ButtonFeedbackDependencies = {
  elements?: ButtonElements | null;
};

function buttonFeedbackKey(elementKey: string, className: string): string {
  return `button-feedback:${elementKey}:${className}`;
}

export class ButtonFeedback extends PresentationComponent {
  elements: ButtonElements | null;

  constructor(dependencies: ButtonFeedbackDependencies = {}) {
    super();
    const { elements } = dependencies;
    this.elements = elements ?? null;
  }

  setElements(elements: ButtonElements | null): void {
    this.elements = elements;
  }

  private _getElement(elementKey: string): HTMLElement | null {
    if (!this.elements || !Object.prototype.hasOwnProperty.call(this.elements, elementKey)) {
      return null;
    }

    return this.elements[elementKey as keyof ButtonElements];
  }

  triggerRecordButtonPop() {
    this.triggerButtonFeedback('recordBtn', 'btn-pop', TIMING.UI_TIMEOUT_MS);
  }

  triggerRecordButtonPress() {
    this.triggerButtonFeedback('recordBtn', 'btn-press', TIMING.UI_TIMEOUT_MS);
  }

  triggerButtonFeedback(elementKey: string, className: string, duration: number) {
    const element = this._getElement(elementKey);
    if (!element) return;

    const lifecycleKey = buttonFeedbackKey(elementKey, className);
    this.cancelManaged(lifecycleKey);
    element.classList.remove(className);
    void element.offsetWidth;

    element.classList.add(className);

    let disposeFeedback = () => {};
    const disposeTimeout = this.timeout(() => {
      disposeFeedback();
    }, duration);
    disposeFeedback = this.replaceManaged(lifecycleKey, () => {
      disposeTimeout();
      element.classList.remove(className);
    });
  }

  setRecordingButtonState(element: HTMLElement | null, isActive: boolean) {
    if (!element) return;

    if (isActive) {
      element.classList.add(CSSClasses.RECORDING);
    } else {
      element.classList.remove(CSSClasses.RECORDING);
    }
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.elements = null;
    return disposed;
  }
}
