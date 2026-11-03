type SmokeApplication = {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
};

/** Exercise the normal application lifecycle, including renderer transport readiness. */
export async function runApplicationSmoke(
  application: SmokeApplication,
  rendererReady: Promise<void>,
  timeoutMs = 45_000
): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let cleanup: Promise<void> | undefined;
  const cleanOnce = () => cleanup ??= Promise.resolve().then(() => application.dispose());
  const lifecycle = (async () => {
    try {
      await application.initialize();
      await rendererReady;
    } finally {
      await cleanOnce();
    }
  })();
  try {
    await Promise.race([
      lifecycle,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          // Start rollback even when startup/readiness hangs, without allowing cleanup to
          // extend the deadline. The process owner exits unsuccessfully after rejection.
          void cleanOnce().catch(() => undefined);
          reject(new Error('Application smoke lifecycle timed out'));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(deadline);
  }
}
