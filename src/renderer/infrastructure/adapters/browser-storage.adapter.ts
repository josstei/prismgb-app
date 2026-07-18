import { getErrorMessage, type LoggerLike, type StorageServiceLike } from '@platform/core';

export interface BrowserStorageAdapterOptions {
  logger?: LoggerLike;
  protectedKeys?: string[];
}

function isStorageQuotaError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const storageError = error as { name?: unknown; code?: unknown };
  return storageError.name === 'QuotaExceededError' || storageError.code === 22;
}

/**
 * Browser Storage Adapter - Abstraction for localStorage API
 *
 * Provides a testable interface for browser storage operations.
 * Handles quota exceeded errors gracefully.
 */
export class BrowserStorageAdapter implements StorageServiceLike {
  private readonly logger: LoggerLike;
  private readonly protectedKeys: string[];

  constructor(options: BrowserStorageAdapterOptions = {}) {
    this.logger = options.logger || console;
    this.protectedKeys = options.protectedKeys || [];
  }

  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      this.logger.warn(`BrowserStorageAdapter.getItem failed for key "${key}":`, getErrorMessage(error));
      return null;
    }
  }

  setItem(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (isStorageQuotaError(error)) {
        this.logger.warn('BrowserStorageAdapter: Quota exceeded, attempting cleanup');
        this._cleanupOldEntries();

        try {
          localStorage.setItem(key, value);
          return true;
        } catch {
          this.logger.error(`BrowserStorageAdapter: Quota still exceeded after cleanup for key "${key}"`);
          return false;
        }
      }

      this.logger.error(`BrowserStorageAdapter.setItem failed for key "${key}":`, getErrorMessage(error));
      return false;
    }
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      this.logger.warn(`BrowserStorageAdapter.removeItem failed for key "${key}":`, getErrorMessage(error));
    }
  }

  _cleanupOldEntries(): void {
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && !this.protectedKeys.includes(key)) {
        keysToRemove.push(key);
      }
    }

    const removeCount = Math.ceil(keysToRemove.length / 2);
    for (let i = 0; i < removeCount && i < keysToRemove.length; i += 1) {
      try {
        localStorage.removeItem(keysToRemove[i]);
      } catch {
        // Ignore removal errors.
      }
    }
  }
}
