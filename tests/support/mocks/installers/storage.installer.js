// @ts-nocheck
import { vi } from 'vitest';
import { createCleanupStack, installTargetProperty } from '../runtime-property.installers.js';
import { installProperty } from './install-property.helper.js';

/**
 * Canonical localStorage installer with in-memory backing.
 */
export function installLocalStorageMock(options = {}) {
  const storageData = { ...(options.initialData || {}) };
  const behavior = {
    getItem: options.getItem,
    setItem: options.setItem,
    removeItem: options.removeItem,
    key: options.key,
    length: options.length,
  };
  const defaults = {
    getItem: (key) => storageData[key] ?? null,
    setItem: (key, value) => {
      storageData[key] = value;
    },
    removeItem: (key) => {
      delete storageData[key];
    },
    key: (index) => Object.keys(storageData)[index],
    length: () => Object.keys(storageData).length,
  };
  const context = {
    storageData,
    defaults,
  };
  const localStorage = options.localStorage ?? {
    getItem: vi.fn((key) => {
      if (typeof behavior.getItem === 'function') {
        return behavior.getItem(key, context);
      }
      return defaults.getItem(key);
    }),
    setItem: vi.fn((key, value) => {
      if (typeof behavior.setItem === 'function') {
        return behavior.setItem(key, value, context);
      }
      return defaults.setItem(key, value);
    }),
    removeItem: vi.fn((key) => {
      if (typeof behavior.removeItem === 'function') {
        return behavior.removeItem(key, context);
      }
      return defaults.removeItem(key);
    }),
    key: vi.fn((index) => {
      if (typeof behavior.key === 'function') {
        return behavior.key(index, context);
      }
      return defaults.key(index);
    }),
    get length() {
      if (typeof behavior.length === 'function') {
        return behavior.length(context);
      }
      if (typeof behavior.length === 'number') {
        return behavior.length;
      }
      return defaults.length();
    },
  };
  const stack = installProperty(globalThis, 'localStorage', localStorage);

  return {
    ...stack,
    localStorage,
    storageData,
    getItem: localStorage.getItem,
    setItem: localStorage.setItem,
    removeItem: localStorage.removeItem,
    key: localStorage.key,
    setGetItemImplementation(implementation) {
      behavior.getItem = implementation;
    },
    setSetItemImplementation(implementation) {
      behavior.setItem = implementation;
    },
    setRemoveItemImplementation(implementation) {
      behavior.removeItem = implementation;
    },
    setKeyImplementation(implementation) {
      behavior.key = implementation;
    },
    setLengthImplementation(implementation) {
      behavior.length = implementation;
    },
  };
}

/**
 * Canonical clipboard installer for Testing Library/user-event tests.
 */
export function installClipboardMock(options = {}) {
  const stack = createCleanupStack();
  const clipboardData = { text: options.text ?? '' };
  const clipboard = {
    writeText: options.writeText ?? vi.fn(async (text) => {
      clipboardData.text = String(text);
    }),
    readText: options.readText ?? vi.fn(async () => clipboardData.text),
    write: options.write ?? vi.fn(async () => undefined),
    read: options.read ?? vi.fn(async () => []),
    ...(options.clipboard ?? {}),
  };

  if (typeof globalThis.navigator === 'undefined') {
    const navigatorStack = installTargetProperty(globalThis, 'navigator', { clipboard });
    stack.add(() => navigatorStack.cleanup());
  } else {
    const clipboardStack = installTargetProperty(globalThis.navigator, 'clipboard', clipboard);
    stack.add(() => clipboardStack.cleanup());
  }

  return {
    ...stack,
    clipboard,
    clipboardData,
    writeText: clipboard.writeText,
    readText: clipboard.readText,
    write: clipboard.write,
    read: clipboard.read,
    setText(text) {
      clipboardData.text = String(text);
    },
    getText() {
      return clipboardData.text;
    },
  };
}
