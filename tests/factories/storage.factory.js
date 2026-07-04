import { vi } from 'vitest';

export function createStorageService(initialValues = {}) {
  const store = new Map(Object.entries(initialValues));

  return {
    getItem: vi.fn((key) => store.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      store.set(key, String(value));
      return true;
    }),
    removeItem: vi.fn((key) => {
      store.delete(key);
      return true;
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    dump() {
      return Object.fromEntries(store.entries());
    }
  };
}
