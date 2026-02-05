/**
 * Interface for objects that hold resources requiring cleanup.
 * Implementers must release resources when dispose() is called.
 */
export interface IDisposable {
  /**
   * Release all resources held by this object.
   * After calling dispose(), the object should not be used.
   */
  dispose(): void | Promise<void>;
}
