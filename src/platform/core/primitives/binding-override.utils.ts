/**
 * Structural container port for applying test-time binding overrides.
 * Deliberately framework-shaped instead of importing inversify types —
 * `@platform` modules stay inversify-free.
 */
export interface BindingOverrideContainer {
  isBound(token: unknown): boolean;
  unbind(token: unknown): unknown;
  bind(token: unknown): { toConstantValue(value: unknown): unknown };
}

/**
 * Replaces container bindings with constant values keyed by a token map.
 * Both process containers use this to install test overrides after their
 * binding modules load.
 */
export function applyBindingOverrides<TKey extends string>(
  container: BindingOverrideContainer,
  tokens: Readonly<Record<TKey, unknown>>,
  overrides: Partial<Record<TKey, unknown>>
): void {
  for (const [key, value] of Object.entries(overrides)) {
    const token = tokens[key as TKey];
    if (container.isBound(token)) {
      container.unbind(token);
    }
    container.bind(token).toConstantValue(value);
  }
}
