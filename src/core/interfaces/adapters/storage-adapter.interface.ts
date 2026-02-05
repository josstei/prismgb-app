/**
 * Interface for storage adapters.
 * Abstracts localStorage/sessionStorage or other storage backends.
 */
export interface IStorageAdapter {
  /**
   * Get a value from storage.
   * @param key - Storage key
   * @returns Stored value or null if not found
   */
  get<T>(key: string): T | null;

  /**
   * Set a value in storage.
   * @param key - Storage key
   * @param value - Value to store
   */
  set<T>(key: string, value: T): void;

  /**
   * Remove a value from storage.
   * @param key - Storage key
   */
  remove(key: string): void;

  /**
   * Check if a key exists in storage.
   * @param key - Storage key
   */
  has(key: string): boolean;

  /**
   * Clear all stored values.
   */
  clear(): void;
}
