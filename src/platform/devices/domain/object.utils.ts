/**
 * Recursively freezes an object graph in place. Already-frozen nodes and
 * primitives are returned untouched.
 */
export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

/**
 * Returns a copy of the record with every undefined-valued key removed,
 * typed for exactOptionalPropertyTypes construction sites.
 */
export function pruneUndefined<T extends object>(record: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as T;
}
