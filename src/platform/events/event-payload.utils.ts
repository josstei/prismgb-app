export function readBooleanPayloadField(payload: unknown, key: string): boolean | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'boolean' ? value : null;
}
