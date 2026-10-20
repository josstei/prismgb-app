import type { Container, ServiceIdentifier } from 'inversify';

/** Replaces (or adds) container bindings with constant values keyed by a token map. */
export function applyBindingOverrides<TKey extends string>(
  container: Container,
  tokens: Readonly<Record<TKey, ServiceIdentifier>>,
  overrides: Partial<Record<TKey, unknown>>
): Container {
  for (const [key, value] of Object.entries(overrides)) {
    const token = tokens[key as TKey];
    if (container.isBound(token)) {
      container.unbind(token);
    }
    container.bind(token).toConstantValue(value);
  }
  return container;
}
