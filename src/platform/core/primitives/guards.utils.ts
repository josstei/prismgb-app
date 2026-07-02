/**
 * Domain-agnostic runtime type guards.
 */

/** Narrows to a non-null object (arrays included, matching `typeof === 'object'`). */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Narrows to a finite number. */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Narrows to a string. */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Narrows to a thenable. */
export function isPromiseLike<T = unknown>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

