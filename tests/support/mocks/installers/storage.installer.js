import { vi } from 'vitest';
import { installTargetProperty } from '../runtime-property.installers.js';

/** In-memory storage with standard Vitest overrides for failure cases. */
export function installLocalStorageMock() {
  const storageData = /** @type {Record<string, string>} */ ({});
  const localStorage = {
    getItem: vi.fn((key) => storageData[key] ?? null),
    setItem: vi.fn((key, value) => { storageData[key] = value; }),
    removeItem: vi.fn((key) => { delete storageData[key]; }),
    key: vi.fn(/** @returns {string | null} */ (index) => Object.keys(storageData)[index] ?? null),
    get length() { return Object.keys(storageData).length; }
  };
  return {
    ...installTargetProperty(globalThis, 'localStorage', localStorage),
    localStorage,
    storageData,
    getItem: localStorage.getItem,
    setItem: localStorage.setItem,
    removeItem: localStorage.removeItem,
    key: localStorage.key
  };
}
