import { vi } from 'vitest';

/**
 * Canonical mock of the renderer tRPC client (`@renderer/infrastructure/ipc/trpc-client`).
 *
 * Mirrors `appRouter`'s namespace tree: query/mutation procedures expose `query`/`mutate` vi.fns;
 * subscription procedures expose a `subscribe` vi.fn that captures its `{ onData }` options and
 * returns an `{ unsubscribe }` handle. Use {@link emitTrpcData} to drive a subscription's `onData`
 * (simulating a main→renderer push) and {@link getTrpcUnsubscribe} to assert teardown.
 *
 * Because electron-trpc's `ipcLink` constructs against a preload global that does not exist under
 * vitest, tests mock the client module via an async factory that imports this helper:
 *
 *   vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => {
 *     const { createTrpcClientMock } = await import('<relative>/support/mocks/trpc-client.mock');
 *     return { trpcClient: createTrpcClientMock() };
 *   });
 */

type MockFn = ReturnType<typeof vi.fn>;

interface QueryProcedureMock {
  query: MockFn;
}
interface MutationProcedureMock {
  mutate: MockFn;
}
export interface SubscriptionProcedureMock {
  subscribe: MockFn;
}

function query(): QueryProcedureMock {
  return { query: vi.fn() };
}

function mutation(): MutationProcedureMock {
  return { mutate: vi.fn() };
}

function subscription(): SubscriptionProcedureMock {
  return {
    subscribe: vi.fn((_input: unknown, _opts: unknown) => ({ unsubscribe: vi.fn() }))
  };
}

export function createTrpcClientMock() {
  return {
    device: {
      getStatus: query(),
      onConnected: subscription(),
      onDisconnected: subscription()
    },
    shell: {
      openExternal: mutation()
    },
    window: {
      setFullScreen: mutation(),
      isFullScreen: query(),
      onEnterFullscreen: subscription(),
      onLeaveFullscreen: subscription(),
      onResized: subscription()
    },
    update: {
      checkForUpdates: mutation(),
      downloadUpdate: mutation(),
      installUpdate: mutation(),
      getStatus: query(),
      onAvailable: subscription(),
      onNotAvailable: subscription(),
      onProgress: subscription(),
      onDownloaded: subscription(),
      onError: subscription()
    },
    performance: {
      getProcessMetrics: query()
    },
    gpu: {
      getPolicy: query()
    },
    loginItem: {
      get: query(),
      set: mutation()
    },
    transcode: {
      start: mutation(),
      cancel: mutation(),
      getStatus: query(),
      onProgress: subscription(),
      onCompleted: subscription(),
      onError: subscription(),
      onCancelled: subscription()
    }
  };
}

export type TrpcClientMock = ReturnType<typeof createTrpcClientMock>;

/**
 * The `subscribe` member is typed `unknown` so callers may pass either a {@link
 * SubscriptionProcedureMock} or the statically-real (mocked-at-runtime) tRPC procedure — the
 * function narrows to the vi.fn mock internally.
 */
type SubscribeBearing = { subscribe: unknown };

function subscribeMockOf(procedure: SubscribeBearing): MockFn {
  return procedure.subscribe as MockFn;
}

/**
 * Invokes the most recent `subscribe` call's `onData` callback, simulating a main→renderer push.
 */
export function emitTrpcData(procedure: SubscribeBearing, payload?: unknown): void {
  const lastCall = subscribeMockOf(procedure).mock.calls.at(-1);
  const options = lastCall?.[1] as { onData?: (value: unknown) => void } | undefined;
  options?.onData?.(payload);
}

/**
 * Returns the `unsubscribe` handle from the most recent `subscribe` call (for teardown assertions).
 */
export function getTrpcUnsubscribe(procedure: SubscribeBearing): MockFn | undefined {
  const lastResult = subscribeMockOf(procedure).mock.results.at(-1);
  if (lastResult?.type !== 'return') {
    return undefined;
  }
  return (lastResult.value as { unsubscribe: MockFn }).unsubscribe;
}
