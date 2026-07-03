import { vi } from 'vitest';
import { createCleanupStack } from '../runtime-property.installers.js';

/**
 * Restores a property on a target by its descriptor.
 *
 * @param {any} target - The target object.
 * @param {string|symbol} key - The property key.
 * @param {any} value - The property value.
 * @returns {any} A cleanup stack handle.
 */
export function installProperty(target, key, value) {
  const stack = createCleanupStack();
  const descriptor = Object.getOwnPropertyDescriptor(target, key);
  const hadProperty = Object.prototype.hasOwnProperty.call(target, key);

  vi.stubGlobal(key, value);

  stack.add(() => {
    try {
      if (descriptor) {
        Object.defineProperty(target, key, descriptor);
      } else if (hadProperty) {
        Reflect.deleteProperty(target, key);
      } else {
        Reflect.deleteProperty(target, key);
      }
    } catch {
      Reflect.deleteProperty(target, key);
    }
  });

  return stack;
}
