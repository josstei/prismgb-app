import { getErrorMessage } from '@platform/core';
import type { LoggerLike } from '@platform/core';

/**
 * The uniform outcome `callIpc` resolves to. Never rejects: a thrown `TRPCError` (or any other
 * rejection) is captured into the `status: 'error'` branch so consumers that need real failure UX
 * can branch on `.status` without a try/catch of their own. The discriminant is a string literal
 * (`'ok' | 'error'`) rather than a boolean: `tsconfig.test.json` runs with `strictNullChecks: false`,
 * under which TypeScript's control-flow analysis narrows a `false`-literal boolean discriminant
 * inconsistently (confirmed empirically — the `'error'` branch fails to narrow though the `'ok'`
 * branch does), while a string-literal discriminant narrows reliably in both branches under either
 * setting.
 */
export type CallIpcResult<TValue> =
  | { readonly status: 'ok'; readonly value: TValue }
  | { readonly status: 'error'; readonly error: string };

/**
 * The single wrapper replacing the renderer's ad hoc `.success`/`.error` envelope branches now that
 * router procedures throw `TRPCError` on failure instead of returning `{ success: false, error }`.
 * Runs `thunk`; on rejection, logs `${label} failed` with the original error and resolves a
 * `{ status: 'error', error }` result carrying the extracted message — the same string a
 * `TRPCClientError` surfaces, preserving today's user-visible failure text.
 */
export async function callIpc<TValue>(
  label: string,
  thunk: () => Promise<TValue>,
  logger: LoggerLike
): Promise<CallIpcResult<TValue>> {
  try {
    const value = await thunk();
    return { status: 'ok', value };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.error(`${label} failed`, error);
    return { status: 'error', error: message };
  }
}
