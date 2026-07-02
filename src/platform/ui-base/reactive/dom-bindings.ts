import { effect } from './signal.js';
import type { ReadonlySignal } from './signal.js';
import type { DisposableFunction } from '@platform/core';

interface TextSink {
  textContent: string | null;
}
interface ClassListSink {
  classList: {
    toggle(token: string, force?: boolean): boolean | void;
  };
}
interface AttrSink {
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
}
interface StylePropertySink {
  style: {
    setProperty(propertyName: string, value: string | null): void;
  };
}

const NOOP: DisposableFunction = () => {};

/** Bind a signal to an element's textContent. Returns the effect disposer. */
export function bindText(
  element: TextSink | null,
  source: ReadonlySignal<unknown>,
  format: (value: unknown) => string = (value) => (value == null ? '' : String(value))
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    element.textContent = format(source.value);
  });
}

/** Toggle a single class token from a boolean signal. */
export function bindClass(
  element: ClassListSink | null,
  token: string,
  source: ReadonlySignal<boolean>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    element.classList.toggle(token, source.value);
  });
}

/** Set/remove an attribute from a nullable string signal. */
export function bindAttr(
  element: AttrSink | null,
  name: string,
  source: ReadonlySignal<string | null | undefined>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    const value = source.value;
    if (value == null) {
      element.removeAttribute(name);
    } else {
      element.setAttribute(name, value);
    }
  });
}

/** Assign a DOM property (e.g. dataset.type, disabled) from a signal. */
export function bindProperty<TElement extends object, TKey extends keyof TElement>(
  element: TElement | null,
  key: TKey,
  source: ReadonlySignal<TElement[TKey]>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    element[key] = source.value;
  });
}

/** Set a CSS custom property (or style property) from a string signal. */
export function bindStyleProperty(
  element: StylePropertySink | null,
  propertyName: string,
  source: ReadonlySignal<string>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    element.style.setProperty(propertyName, source.value);
  });
}
