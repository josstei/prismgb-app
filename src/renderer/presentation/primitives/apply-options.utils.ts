export function applyOptions<TOptions extends object>(
  instance: object,
  defaults: Partial<TOptions>,
  options: TOptions
): void {
  const target = instance as Record<string, unknown>;
  const fallback = defaults as Record<string, unknown>;
  const source = options as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(fallback), ...Object.keys(source)]);

  for (const key of keys) {
    const optionValue = source[key];
    target[key] = optionValue !== undefined ? optionValue : fallback[key];
  }
}
