type SafeDisposeLogger = { error(...args: unknown[]): void };
type DisposableMethod = () => unknown | Promise<unknown>;
type DisposableResource = object | null | undefined;
type SafeDisposeEntry = readonly [name: string, resource: DisposableResource, method?: string];

export async function safeDispose(logger: SafeDisposeLogger, name: string, resource: DisposableResource, method = 'dispose'): Promise<void> {
  if (!resource) return;

  try {
    const fn = (resource as Record<string, unknown>)[method];
    if (typeof fn === 'function') await (fn as DisposableMethod).call(resource);
  } catch (error) {
    logger.error(`Error disposing ${name}:`, error);
  }
}

export async function safeDisposeAll(logger: SafeDisposeLogger, resources: readonly SafeDisposeEntry[]): Promise<void> {
  for (const [name, resource, method] of resources) {
    await safeDispose(logger, name, resource, method);
  }
}
