import type { Logger } from './logger';

type SafeDisposeLogger = Pick<Logger, 'error'>;

export async function safeDispose(logger: SafeDisposeLogger, label: string, dispose: () => unknown): Promise<void> {
  try {
    await dispose();
  } catch (error) {
    logger.error(`Error disposing ${label}:`, error);
  }
}

export async function safeDisposeAll(
  logger: SafeDisposeLogger,
  entries: ReadonlyArray<readonly [label: string, dispose: () => unknown]>
): Promise<void> {
  for (const [label, dispose] of entries) {
    await safeDispose(logger, label, dispose);
  }
}
