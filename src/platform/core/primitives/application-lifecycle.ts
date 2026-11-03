/** Owns a process runtime: one initialization, rollback, and one asynchronous teardown. */
export function createApplicationLifecycle(
  initializeRuntime: () => void | Promise<void>,
  disposeRuntime: () => void | Promise<void>
) {
  let initialization: Promise<void> | null = null;
  let disposal: Promise<void> | null = null;
  let cleanup: Promise<void> | null = null;
  let disposed = false;
  const cleanOnce = () => cleanup ??= Promise.resolve().then(disposeRuntime);

  return {
    initialize(): Promise<void> {
      if (disposed) return Promise.reject(new Error('Runtime has been disposed'));
      return initialization ??= Promise.resolve().then(initializeRuntime).catch(async (error: unknown) => {
        disposed = true;
        try { await cleanOnce(); } catch { /* Preserve the initialization failure. */ }
        throw error;
      });
    },
    dispose(): Promise<void> {
      disposed = true;
      return disposal ??= (async () => {
        try { await initialization; } catch { /* Initialization already rolled back. */ }
        await cleanOnce();
      })();
    }
  };
}

/** Explicit ordered teardown: every owner gets a chance to release its resources. */
export async function disposeInOrder(disposers: readonly (() => void | Promise<void>)[]): Promise<void> {
  const errors: unknown[] = [];
  for (const dispose of disposers) {
    try { await dispose(); } catch (error) { errors.push(error); }
  }
  if (errors.length) throw new AggregateError(errors, 'Runtime disposal failed');
}
